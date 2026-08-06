"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import {
  Box,
  Download,
  Grid2X2,
  ImageIcon,
  Minimize2,
  Play,
  RefreshCw,
  Share2,
} from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  resolveImageDownloadUrl,
  triggerBrowserDownload,
} from "@/workflow/ideart/lib/url/download-url";
import { resolveLibTvStoryboardVideoMotionPrompt } from "@/workflow/ideart/lib/libtv/script";
import { WorkflowImageGenerationPlaceholder } from "./nodes/workflow-node-placeholders";
import {
  StoryboardGroupIcon,
  TapNowNodeIcon,
  UngroupIcon,
} from "./nodes/workflow-node-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  CANVAS_CONTROLS_MENU_PANEL_STYLE,
  WORKFLOW_GROUP_COLOR_OPTIONS,
  WORKFLOW_GROUP_DEFAULT_BACKGROUND,
  WORKFLOW_GROUP_DEFAULT_SWATCH,
} from "./surface-contracts";
import {
  isWorkflowImageResultGroupContainer,
  isWorkflowOrdinaryImageNode,
} from "./workflow-node-kinds";
import {
  getWorkflowImageGeneratorResultDisplayFrame,
  normalizeWorkflowDurationLabel,
  resolveWorkflowEstimatedImageGenerationProgress,
} from "./workflow-media-utils";
import { getWorkflowRenderedNodeFrame } from "./workflow-layout";
import {
  WORKFLOW_IMAGE_GROUP_STACK_OFFSET_X,
  WORKFLOW_IMAGE_GROUP_STACK_OFFSET_Y,
  WORKFLOW_NODE_TITLE_BAR_CLASS,
  WORKFLOW_NODE_TITLE_BAR_STYLE,
  getWorkflowNodeTitleWidth,
} from "./workflow-connections";
import {
  OrdinaryImageToolbar,
  StoryboardLayoutGridMenuIcon,
  StoryboardLayoutHorizontalMenuIcon,
  StoryboardLayoutVerticalMenuIcon,
  StoryboardRunGroupHandCue,
  StoryboardToolbarDownloadIcon,
  StoryboardToolbarLayoutIcon,
  StoryboardToolbarPlayIcon,
  StoryboardToolbarUngroupIcon,
} from "./image-toolbar";
import { WorkflowMediaFullscreenPreview } from "./node-shared-ui";
import { BatchStoryboardVideoModal } from "./generation-popovers";
import { NodeGenerationBar } from "./generation-composer";
import { ExpandCornersIcon } from "./workflow-icons";
import type {
  BatchStoryboardVideoItem,
  OrdinaryImageToolbarAction,
  WorkflowGenerateNodeHandler,
  WorkflowStoryboardVideoGenerateRequest,
} from "./surface-contracts";
import type { WorkflowUpstreamNodeSummary } from "./workflow-models";

export function TapNowGroupNode({
  node,
  selected,
  showFloatingControls,
  dragging = false,
  childNodes,
  onUpdateNode,
  onMoveNode,
  onUngroupNode,
  onGenerateStoryboardVideos,
  onConvertGroupToStoryboard,
  onRunGroup,
  onDownloadNode,
  onSaveNodeToMaterials,
  onRunImageToolbarPreset,
  onCreateImageUpscalePreset,
  onRemoveBackgroundNode,
  onReportNodeIssue,
  onGenerateNode,
  projectId,
  upstreamNodes = [],
}: {
  node: LibTvWorkflowNode;
  selected: boolean;
  showFloatingControls: boolean;
  dragging?: boolean;
  childNodes?: LibTvWorkflowNode[];
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onMoveNode?: (
    id: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onRegenerateStoryboardImages?: (id: string) => void;
  onUngroupNode?: (id: string) => void;
  onGenerateStoryboardVideos?: (
    id: string,
    request: WorkflowStoryboardVideoGenerateRequest,
  ) => void;
  onConvertGroupToStoryboard?: (id: string) => void;
  onRunGroup?: (id: string) => void;
  onDownloadNode?: (id: string) => void;
  onSaveNodeToMaterials?: (id: string) => void;
  onRunImageToolbarPreset?: (id: string, presetId: string) => void;
  onCreateImageUpscalePreset?: (id: string) => void;
  onRemoveBackgroundNode?: (id: string) => void;
  onReportNodeIssue?: (id: string) => void;
  projectId?: string;
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
}) {
  const [title, setTitle] = useState(String(node.data?.title || "Group"));
  const [generationProgressNow, setGenerationProgressNow] = useState(() =>
    Date.now(),
  );
  const childCount =
    childNodes?.length ??
    (Array.isArray(node.data?.groupNodeIds)
      ? node.data.groupNodeIds.length
      : 0);
  const background = String(
    node.data?.groupBackgroundColor || WORKFLOW_GROUP_DEFAULT_BACKGROUND,
  );
  const resolvedBackground =
    background === "transparent" ? "transparent" : background;
  const backgroundSwatch =
    resolvedBackground === "transparent" ||
    resolvedBackground === WORKFLOW_GROUP_DEFAULT_BACKGROUND
      ? WORKFLOW_GROUP_DEFAULT_SWATCH
      : resolvedBackground;
  const groupRunning = Boolean(node.data?.groupRunning);
  const groupToolbarHidden = Boolean(node.data?.groupToolbarHidden);
  const imageChildren = useMemo(
    () =>
      (childNodes || [])
        .filter((child) => child.kind === "image")
        .sort(
          (a, b) =>
            Number(a.data?.workflowGenerationResultIndex ?? 0) -
            Number(b.data?.workflowGenerationResultIndex ?? 0),
        ),
    [childNodes, node.id],
  );
  const isImageResultGroup = isWorkflowImageResultGroupContainer(
    node,
    childNodes || [],
  );
  const hasStoryboardImageMetadata = imageChildren.some(
    (child) =>
      Number.isFinite(Number(child.data?.workflowStoryboardSourceRowIndex)) ||
      String((child.data as any)?.workflowStoryboardSourceNodeId || "").trim(),
  );
  const isStoryboardVideoGroup =
    Boolean(
      String(
        (node.data as any)?.workflowStoryboardVideoSourceGroupId || "",
      ).trim(),
    ) ||
    (childNodes || []).some(
      (child) =>
        child.kind === "video" &&
        (Number.isFinite(
          Number((child.data as any)?.workflowStoryboardVideoSegmentIndex),
        ) ||
          Array.isArray(
            (child.data as any)?.workflowStoryboardSourceRowIndexes,
          ) ||
          String(
            (child.data as any)?.workflowStoryboardSourceNodeId || "",
          ).trim()),
    );
  const isStoryboardGroup =
    hasStoryboardImageMetadata ||
    node.data?.workflowStoryboardPending === true ||
    Array.isArray((node.data as any)?.workflowStoryboardRowIndexes) ||
    String((node.data as any)?.workflowStoryboardSourceNodeId || "").trim();
  const isImageGeneratorResultGroup =
    isImageResultGroup &&
    (String(node.data?.componentType || "") === "image-generator" ||
      (!hasStoryboardImageMetadata &&
        (Boolean(node.data?.workflowGenerationJobId) ||
          Boolean(node.data?.prompt) ||
          Boolean(node.data?.generationCount) ||
          String(node.data?.title || "").includes("图片生成器"))));
  const imageGeneratorRunning =
    isImageGeneratorResultGroup &&
    Boolean(node.data?.workflowGenerationRunning);
  const running = groupRunning || imageGeneratorRunning;
  const rawImageGeneratorProgress = Number(
    node.data?.workflowGenerationProgress,
  );
  const imageGeneratorProgress =
    resolveWorkflowEstimatedImageGenerationProgress(
      node.data?.workflowGenerationStartedAt,
      rawImageGeneratorProgress,
      generationProgressNow,
    ) ?? 0;
  const imageGroupCollapsed =
    isImageResultGroup && Boolean(node.data?.groupCollapsed);
  const completedImageChildren = useMemo(
    () =>
      imageChildren.filter((child) =>
        String(child.data?.mediaUrl || "").trim(),
      ),
    [imageChildren],
  );
  const shouldTickEstimatedImageGenerationProgress =
    (isImageGeneratorResultGroup &&
      imageGeneratorRunning &&
      Number.isFinite(Number(node.data?.workflowGenerationStartedAt))) ||
    imageChildren.some(
      (child) =>
        Boolean(child.data?.workflowGenerationRunning) &&
        Number.isFinite(Number(child.data?.workflowGenerationStartedAt)),
    );

  useEffect(() => {
    if (!shouldTickEstimatedImageGenerationProgress) return;
    const timer = window.setInterval(
      () => setGenerationProgressNow(Date.now()),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [shouldTickEstimatedImageGenerationProgress]);
  const primaryImageChild =
    completedImageChildren.find(
      (child) =>
        String(child.data?.mediaUrl || "").trim() ===
        String(node.data?.mediaUrl || "").trim(),
    ) || completedImageChildren[0];
  const primaryImageUrl = String(
    primaryImageChild?.data?.mediaUrl || "",
  ).trim();
  const primaryImageFrame = primaryImageChild
    ? getWorkflowRenderedNodeFrame(primaryImageChild)
    : null;
  const primaryImageDisplayFrame = isImageGeneratorResultGroup
    ? getWorkflowImageGeneratorResultDisplayFrame(
        primaryImageChild,
        String(node.data?.aspectRatio || "16:9"),
      )
    : primaryImageFrame;
  const collapsedImageWidth = Math.max(
    1,
    Number(primaryImageDisplayFrame?.width || node.width || 1),
  );
  const collapsedImageHeight = Math.max(
    1,
    Number(primaryImageDisplayFrame?.height || node.height || 1),
  );
  const primaryImageNaturalWidth = Math.max(
    0,
    Math.round(Number(primaryImageChild?.data?.workflowMediaNaturalWidth || 0)),
  );
  const primaryImageNaturalHeight = Math.max(
    0,
    Math.round(
      Number(primaryImageChild?.data?.workflowMediaNaturalHeight || 0),
    ),
  );
  const primaryImageNaturalSizeLabel =
    primaryImageNaturalWidth > 0 && primaryImageNaturalHeight > 0
      ? `${primaryImageNaturalWidth} × ${primaryImageNaturalHeight}`
      : "";
  const groupChildren = useMemo(() => childNodes || [], [childNodes]);
  const videoChildren = useMemo(
    () =>
      groupChildren
        .filter((child) => child.kind === "video")
        .sort(
          (a, b) =>
            Number(
              a.data?.workflowStoryboardVideoSegmentIndex ??
                a.data?.workflowGenerationResultIndex ??
                0,
            ) -
            Number(
              b.data?.workflowStoryboardVideoSegmentIndex ??
                b.data?.workflowGenerationResultIndex ??
                0,
            ),
        ),
    [groupChildren],
  );
  const failedStoryboardVideoChild = videoChildren.find((child) =>
    String(child.data?.workflowGenerationError || "").trim(),
  );
  const canResumeStoryboardVideos = Boolean(
    failedStoryboardVideoChild &&
    node.data?.workflowStoryboardVideoSourceGroupId &&
    typeof failedStoryboardVideoChild?.data
      ?.workflowStoryboardVideoSegmentIndex === "number" &&
    !running,
  );
  const previousSuccessfulVideoTailFrameUrl = (() => {
    if (!failedStoryboardVideoChild) return "";
    const failedIndex = Number(
      failedStoryboardVideoChild.data?.workflowStoryboardVideoSegmentIndex,
    );
    if (!Number.isFinite(failedIndex) || failedIndex <= 0) return "";
    const previous = [...videoChildren]
      .filter(
        (child) =>
          Number(child.data?.workflowStoryboardVideoSegmentIndex ?? -1) <
          failedIndex,
      )
      .sort(
        (a, b) =>
          Number(b.data?.workflowStoryboardVideoSegmentIndex ?? 0) -
          Number(a.data?.workflowStoryboardVideoSegmentIndex ?? 0),
      )
      .find((child) =>
        String(child.data?.workflowStoryboardVideoTailFrameUrl || "").trim(),
      );
    return String(
      previous?.data?.workflowStoryboardVideoTailFrameUrl || "",
    ).trim();
  })();
  const layoutTargets = useMemo(
    () => (isImageResultGroup ? imageChildren : groupChildren),
    [groupChildren, imageChildren, isImageResultGroup],
  );
  const ordinaryImageGroupChildren = useMemo(
    () =>
      groupChildren.filter(
        (child) =>
          isWorkflowOrdinaryImageNode(child) &&
          String(child.data?.mediaUrl || "").trim(),
      ),
    [groupChildren],
  );
  const canConvertToStoryboardGroup =
    !isImageResultGroup &&
    groupChildren.length > 1 &&
    ordinaryImageGroupChildren.length === groupChildren.length;
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [floatingMenuAnchor, setFloatingMenuAnchor] = useState<{
    type: "color" | "layout";
    left: number;
    top: number;
  } | null>(null);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [mediaPreviewOpen, setMediaPreviewOpen] = useState(false);
  const [videoBatchMode, setVideoBatchMode] = useState(false);
  const [storyboardVideoModelId, setStoryboardVideoModelId] = useState(
    String((node.data as any)?.storyboardVideoModelId || ""),
  );
  const [storyboardVideoAspectRatio, setStoryboardVideoAspectRatio] = useState(
    String((node.data as any)?.storyboardVideoAspectRatio || ""),
  );
  const [storyboardVideoResolution, setStoryboardVideoResolution] = useState(
    String((node.data as any)?.storyboardVideoResolution || ""),
  );
  const [storyboardVideoDuration, setStoryboardVideoDuration] = useState(
    String((node.data as any)?.storyboardVideoDuration || ""),
  );
  const [storyboardVideoMethod, setStoryboardVideoMethod] = useState(
    String((node.data as any)?.storyboardVideoMethod || ""),
  );
  const [storyboardVideoGenerationCount, setStoryboardVideoGenerationCount] =
    useState<number | undefined>(() => {
      const count = Number((node.data as any)?.storyboardVideoGenerationCount);
      return Number.isFinite(count)
        ? Math.max(1, Math.round(count))
        : undefined;
    });
  const [storyboardVideoGenerateAudio, setStoryboardVideoGenerateAudio] =
    useState(
      typeof (node.data as any)?.storyboardVideoGenerateAudio === "boolean"
        ? Boolean((node.data as any).storyboardVideoGenerateAudio)
        : undefined,
    );
  const [storyboardVideoWebSearch, setStoryboardVideoWebSearch] = useState(
    typeof (node.data as any)?.storyboardVideoWebSearch === "boolean"
      ? Boolean((node.data as any).storyboardVideoWebSearch)
      : undefined,
  );
  const [storyboardVideoExtraParameters, setStoryboardVideoExtraParameters] =
    useState<LibTvWorkflowNode["data"]["workflowExtraParameters"]>(
      (node.data as any)?.storyboardVideoExtraParameters,
    );
  const batchStoryboardVideoItems = useMemo<BatchStoryboardVideoItem[]>(
    () =>
      imageChildren.map((child, index) => {
        const rowIndexValue = Number(
          child.data?.workflowStoryboardSourceRowIndex,
        );
        const rowIndex = Number.isFinite(rowIndexValue) ? rowIndexValue : index;
        const labelNumber = rowIndex + 1;
        const prompt = String(
          (child.data as any)?.workflowStoryboardVideoMotionPrompt ||
            resolveLibTvStoryboardVideoMotionPrompt(child.data as any) ||
            (child.data as any)?.motionPrompt ||
            child.data?.prompt ||
            child.data?.content ||
            "",
        ).trim();
        return {
          id: child.id,
          rowIndex,
          label: `镜头 ${labelNumber}`,
          prompt,
          duration: (() => {
            const value = String(
              child.data?.workflowStoryboardDuration ||
                child.data?.videoDuration ||
                storyboardVideoDuration ||
                "",
            ).trim();
            return value ? normalizeWorkflowDurationLabel(value) : "";
          })(),
        };
      }),
    [imageChildren, storyboardVideoDuration],
  );
  const firstStoryboardIndex = imageChildren.reduce((min, child) => {
    const value = Number(child.data?.workflowStoryboardSourceRowIndex);
    return Number.isFinite(value) ? Math.min(min, value) : min;
  }, Number.POSITIVE_INFINITY);
  const resultTitle = isImageResultGroup
    ? isImageGeneratorResultGroup
      ? title || "图片生成器"
      : "镜头图 · 脚本生成器"
    : title;
  const useStoryboardGroupToolbar =
    (isStoryboardGroup && isImageResultGroup && !isImageGeneratorResultGroup) ||
    isStoryboardVideoGroup;
  const imageGeneratorDisplayLayouts = useMemo(() => {
    if (!isImageGeneratorResultGroup)
      return new Map<
        string,
        {
          x: number;
          y: number;
          width: number;
          height: number;
          naturalLabel: string;
        }
      >();
    const gap = 8;
    const columns = Math.min(2, Math.max(1, imageChildren.length));
    const layouts = new Map<
      string,
      {
        x: number;
        y: number;
        width: number;
        height: number;
        naturalLabel: string;
      }
    >();
    imageChildren.forEach((child, index) => {
      const naturalWidth = Math.max(
        0,
        Math.round(Number(child.data?.workflowMediaNaturalWidth || 0)),
      );
      const naturalHeight = Math.max(
        0,
        Math.round(Number(child.data?.workflowMediaNaturalHeight || 0)),
      );
      const frame = getWorkflowImageGeneratorResultDisplayFrame(
        child,
        String(node.data?.aspectRatio || "16:9"),
      );
      const column = index % columns;
      const row = Math.floor(index / columns);
      layouts.set(child.id, {
        x: column * (frame.width + gap),
        y: row * (frame.height + gap),
        width: frame.width,
        height: frame.height,
        naturalLabel:
          naturalWidth > 0 && naturalHeight > 0
            ? `${naturalWidth} × ${naturalHeight}`
            : "",
      });
    });
    return layouts;
  }, [imageChildren, isImageGeneratorResultGroup, node.data?.aspectRatio]);
  const selectedStoryboardVideoDurationSeconds = Math.max(
    1,
    Number(String(storyboardVideoDuration || "").replace(/[^\d.]/g, "")) ||
      Math.max(
        0,
        ...imageChildren.map(
          (child) =>
            Number(
              String(
                (child.data as any)?.workflowStoryboardDuration ||
                  child.data?.videoDuration ||
                  "",
              ).replace(/[^\d.]/g, ""),
            ) || 0,
        ),
      ),
  );
  const applyImageResultLayout = useCallback(
    (layout: "grid" | "horizontal" | "vertical") => {
      if (layoutTargets.length === 0) return;
      const baseWidth = Math.max(
        120,
        Math.max(
          ...layoutTargets
            .map((child) => Number(child.width || 0))
            .filter((value) => Number.isFinite(value) && value > 0),
          188,
        ),
      );
      const baseHeight = Math.max(
        90,
        Math.max(
          ...layoutTargets
            .map((child) => Number(child.height || 0))
            .filter((value) => Number.isFinite(value) && value > 0),
          120,
        ),
      );
      const gap = 16;
      const padX = 40;
      const padTop = 60;
      const padBottom = 32;
      const columns =
        layout === "horizontal"
          ? layoutTargets.length
          : layout === "vertical"
            ? 1
            : Math.max(1, Math.ceil(Math.sqrt(layoutTargets.length)));
      const rows = Math.max(
        1,
        Math.ceil(layoutTargets.length / Math.max(1, columns)),
      );
      layoutTargets.forEach((child, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        onMoveNode?.(child.id, {
          x: padX + column * (baseWidth + gap),
          y: padTop + row * (baseHeight + gap),
          width: baseWidth,
          height: baseHeight,
        });
      });
      onMoveNode?.(node.id, {
        width: Math.max(
          320,
          padX * 2 + columns * baseWidth + Math.max(0, columns - 1) * gap,
        ),
        height: Math.max(
          220,
          padTop + padBottom + rows * baseHeight + Math.max(0, rows - 1) * gap,
        ),
      });
      onUpdateNode?.(node.id, {
        groupLayout: layout,
      } as any);
      setLayoutMenuOpen(false);
    },
    [layoutTargets, node.id, onMoveNode, onUpdateNode],
  );
  const downloadImageResultGroupZip = useCallback(() => {
    if (batchDownloading) return;
    const downloadable = completedImageChildren
      .map((child, index) => {
        const url = String(child.data?.mediaUrl || "").trim();
        const rowIndex = Number(child.data?.workflowStoryboardSourceRowIndex);
        const storyboardNumber = Number.isFinite(rowIndex)
          ? rowIndex + 1
          : index + 1;
        return url ? { url, storyboardNumber, index } : null;
      })
      .filter(Boolean) as Array<{
      url: string;
      storyboardNumber: number;
      index: number;
    }>;
    if (downloadable.length === 0) return;
    setBatchDownloading(true);
    void (async () => {
      try {
        const zip = new JSZip();
        for (const item of downloadable) {
          const response = await fetch(resolveImageDownloadUrl(item.url));
          if (!response.ok) throw new Error("批量下载失败");
          const filePrefix = isImageGeneratorResultGroup
            ? "image"
            : "storyboard";
          const fileIndex = isImageGeneratorResultGroup
            ? item.index + 1
            : item.storyboardNumber;
          zip.file(
            `${filePrefix}-${String(fileIndex).padStart(2, "0")}.png`,
            await response.blob(),
          );
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const objectUrl = URL.createObjectURL(blob);
        try {
          const safeTitle =
            String(
              node.data?.title ||
                (isImageGeneratorResultGroup ? "images" : "storyboard"),
            )
              .trim()
              .replace(/[\\/:*?"<>|]+/g, "-")
              .replace(/\s+/g, "-")
              .slice(0, 80) ||
            (isImageGeneratorResultGroup ? "images" : "storyboard");
          triggerBrowserDownload(objectUrl, `${safeTitle}-${Date.now()}.zip`);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (error) {
        console.error(
          "[LibTvWorkflowSurface] batch download storyboard images failed",
          error,
        );
      } finally {
        setBatchDownloading(false);
      }
    })();
  }, [
    batchDownloading,
    completedImageChildren,
    isImageGeneratorResultGroup,
    node.data?.title,
  ]);
  const showImageGeneratorCollapsedToolbar =
    showFloatingControls &&
    isImageGeneratorResultGroup &&
    imageGroupCollapsed &&
    Boolean(primaryImageUrl) &&
    !imageGeneratorRunning;
  const handleImageGeneratorToolbarAction = useCallback(
    (action: OrdinaryImageToolbarAction) => {
      const targetId = primaryImageChild?.id || node.id;
      if (action === "download") {
        if (primaryImageChild && onDownloadNode) {
          onDownloadNode(primaryImageChild.id);
          return;
        }
        if (primaryImageUrl) {
          const safeTitle =
            String(
              primaryImageChild?.data?.title || node.data?.title || "image",
            )
              .trim()
              .replace(/[\\/:*?"<>|]+/g, "-")
              .replace(/\s+/g, "-")
              .slice(0, 80) || "image";
          triggerBrowserDownload(
            resolveImageDownloadUrl(primaryImageUrl),
            `${safeTitle}.png`,
          );
        }
        return;
      }
      if (action === "fullscreen") {
        if (primaryImageUrl) setMediaPreviewOpen(true);
        return;
      }
      if (action === "enhance") {
        if (onCreateImageUpscalePreset) {
          onCreateImageUpscalePreset(targetId);
        } else {
          message.info("高清能力暂不可用");
        }
        return;
      }
      if (action === "remove-bg") {
        if (onRemoveBackgroundNode) {
          onRemoveBackgroundNode(targetId);
        } else {
          message.info("抠图能力暂不可用");
        }
        return;
      }
      if (action === "save") {
        onSaveNodeToMaterials?.(targetId);
        return;
      }
      if (action === "report") {
        onReportNodeIssue?.(targetId);
        return;
      }
      const actionLabels: Partial<Record<OrdinaryImageToolbarAction, string>> =
        {
          crop: "裁剪",
          clip: "裁剪",
          rotate: "多角度",
          edit: "重绘",
          clean: "打光",
          expand: "扩图",
          erase: "擦除",
          annotate: "标注",
          resize: "调整像素",
          "seedance-check": "解析",
          replace: "替换",
        };
      message.info(
        `${actionLabels[action] || "该操作"}请先展开后对单张图片操作`,
      );
    },
    [
      node.data?.title,
      node.id,
      onCreateImageUpscalePreset,
      onDownloadNode,
      onRemoveBackgroundNode,
      onReportNodeIssue,
      onSaveNodeToMaterials,
      primaryImageChild,
      primaryImageUrl,
    ],
  );

  useEffect(() => {
    setTitle(String(node.data?.title || "Group"));
  }, [node.data?.title]);

  useEffect(() => {
    if (!colorMenuOpen && !layoutMenuOpen) setFloatingMenuAnchor(null);
  }, [colorMenuOpen, layoutMenuOpen]);

  return (
    <div
      className="group node-shell relative h-full w-full overflow-visible rounded-2xl text-white"
      data-testid={`canvas-node-group-${node.id}`}
      data-storyboard-group={
        isStoryboardGroup || isStoryboardVideoGroup ? "true" : undefined
      }
      data-storyboard-group-type={
        isStoryboardVideoGroup
          ? "video"
          : isStoryboardGroup
            ? "image"
            : undefined
      }
      style={{
        minWidth: 260,
        minHeight: 180,
        pointerEvents: "auto",
      }}
    >
      <div
        className={
          isImageResultGroup
            ? "absolute inset-0 rounded-sm"
            : "absolute inset-0 rounded-2xl"
        }
        style={{
          background: resolvedBackground,
          border: isImageResultGroup
            ? "1px solid var(--canvas-group-border, rgba(255,255,255,0.18))"
            : "1px solid rgba(255,255,255,0.18)",
          boxShadow: selected
            ? "inset 0 0 0 2px rgba(255,255,255,0.44), 0 18px 44px rgba(0,0,0,0.28)"
            : isImageResultGroup
              ? "none"
              : "inset 0 0 0 1px rgba(255,255,255,0.08)",
          backdropFilter: isImageResultGroup ? "none" : "blur(2px)",
          cursor: "grab",
          pointerEvents: "auto",
        }}
      />
      <div
        className={WORKFLOW_NODE_TITLE_BAR_CLASS}
        style={WORKFLOW_NODE_TITLE_BAR_STYLE}
      >
        <span
          className="flex shrink-0 items-center text-white/86"
          style={{ width: 14, height: 14 }}
        >
          <TapNowNodeIcon kind="group" size={14} opacity={0.9} />
        </span>
        <div
          className="relative min-w-0 max-w-full shrink"
          style={{ width: getWorkflowNodeTitleWidth(resultTitle || "Group") }}
        >
          <span
            className="pointer-events-none invisible inline-block select-none whitespace-pre align-top"
            aria-hidden="true"
          >
            {resultTitle || "Group"}
          </span>
          {isImageResultGroup ? (
            <span className="absolute inset-0 box-border h-auto w-full truncate p-0 text-inherit">
              {resultTitle}
            </span>
          ) : (
            <input
              placeholder="请输入标题"
              className="nodrag nopan nowheel absolute inset-0 box-border h-auto w-full border-none bg-transparent p-0 text-inherit outline-none"
              data-testid="canvas-node-title"
              value={title}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() =>
                onUpdateNode?.(node.id, { title: title.trim() || "Group" })
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          )}
        </div>
        {isImageGeneratorResultGroup && primaryImageNaturalSizeLabel ? (
          <span
            className="shrink-0 whitespace-nowrap pl-1 text-[11px] tabular-nums text-white/42"
            title={primaryImageNaturalSizeLabel}
          >
            {primaryImageNaturalSizeLabel}
          </span>
        ) : null}
      </div>

      {!isImageResultGroup ? (
        <>
          <div className="pointer-events-auto absolute left-0 top-0 h-3 w-full cursor-grab active:cursor-grabbing" />
          <div className="pointer-events-auto absolute bottom-0 left-0 h-3 w-full cursor-grab active:cursor-grabbing" />
          <div className="pointer-events-auto absolute left-0 top-0 h-full w-3 cursor-grab active:cursor-grabbing" />
          <div className="pointer-events-auto absolute right-0 top-0 h-full w-3 cursor-grab active:cursor-grabbing" />
        </>
      ) : null}

      {showImageGeneratorCollapsedToolbar ? (
        <OrdinaryImageToolbar
          kind="image"
          onImagePreset={(presetId) => {
            if (!primaryImageChild) return;
            onRunImageToolbarPreset?.(primaryImageChild.id, presetId);
          }}
          onAction={handleImageGeneratorToolbarAction}
        />
      ) : null}

      {showFloatingControls &&
      !groupToolbarHidden &&
      !showImageGeneratorCollapsedToolbar ? (
        <div
          className={
            useStoryboardGroupToolbar
              ? "node-floating-ui nodrag nowheel nopan pointer-events-auto absolute left-1/2 z-[1000] flex w-max -translate-x-1/2 -translate-y-full items-center whitespace-nowrap"
              : "node-floating-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 z-30 flex w-max -translate-x-1/2 -translate-y-full flex-nowrap items-center whitespace-nowrap rounded-xl p-2 text-canvas-controls-text"
          }
          style={
            useStoryboardGroupToolbar
              ? {
                  top: isImageResultGroup ? -42 : -42,
                  padding: 8,
                  gap: 8,
                  borderRadius: 12,
                  border: "0.5px solid var(--canvas-controls-border)",
                  background: "var(--canvas-controls-bg)",
                  boxShadow: "rgba(0, 0, 0, 0.08) 0px 4px 10px 0px",
                  backdropFilter: "blur(16px)",
                  color: "var(--canvas-controls-text)",
                }
              : {
                  ...CANVAS_CONTROLS_MENU_PANEL_STYLE,
                  top: isImageResultGroup ? -38 : -12,
                  gap: 8,
                }
          }
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <button
            type="button"
            title="设置组背景色"
            className={
              useStoryboardGroupToolbar
                ? "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-canvas-controls-hover"
                : "relative inline-flex size-8 items-center justify-center rounded-lg text-white/86 transition-colors hover:bg-white/[0.08]"
            }
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setFloatingMenuAnchor({
                type: "color",
                left: rect.left,
                top: rect.top - 8,
              });
              setColorMenuOpen((open) => !open);
              setLayoutMenuOpen(false);
            }}
          >
            <span
              className="size-6 rounded-full"
              style={{ background: backgroundSwatch }}
            />
          </button>
          <button
            type="button"
            title="布局"
            className={
              useStoryboardGroupToolbar
                ? "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-canvas-controls-hover"
                : "relative inline-flex size-8 items-center justify-center rounded-lg text-white/86 transition-colors hover:bg-white/[0.08]"
            }
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setFloatingMenuAnchor({
                type: "layout",
                left: rect.left + rect.width / 2,
                top: rect.top,
              });
              setLayoutMenuOpen((open) => !open);
              setColorMenuOpen(false);
            }}
          >
            {useStoryboardGroupToolbar ? (
              <StoryboardToolbarLayoutIcon />
            ) : (
              <Grid2X2 className="size-4" />
            )}
          </button>
          <div
            className={
              useStoryboardGroupToolbar
                ? "mx-0.5 min-h-8 w-px shrink-0 self-stretch bg-[var(--canvas-controls-border)]"
                : "mx-0.5 min-h-8 w-px shrink-0 self-stretch bg-white/10"
            }
            aria-hidden="true"
          />
          {useStoryboardGroupToolbar ? (
            <>
              <button
                type="button"
                title="整组执行"
                className="relative flex h-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-[var(--Components-Brand-button-secondary-Hover,rgba(60,181,204,0.15))]"
                style={{ color: "var(--fg-brand, #05DFF6)" }}
                disabled={running}
                onClick={(event) => {
                  event.stopPropagation();
                  if (running) return;
                  onRunGroup?.(node.id);
                }}
              >
                <StoryboardToolbarPlayIcon />
                <span>{running ? "生成中" : "整组执行"}</span>
                {!running ? <StoryboardRunGroupHandCue /> : null}
              </button>
              {isImageResultGroup && !isStoryboardVideoGroup ? (
                <button
                  type="button"
                  title="批量生成视频"
                  className="flex h-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover"
                  onClick={(event) => {
                    event.stopPropagation();
                    setVideoBatchMode(true);
                  }}
                >
                  <Share2 className="size-4" />
                  <span>批量生成视频</span>
                </button>
              ) : null}
              <button
                type="button"
                title="解组"
                className="flex h-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover"
                onClick={(event) => {
                  event.stopPropagation();
                  onUngroupNode?.(node.id);
                }}
              >
                <StoryboardToolbarUngroupIcon />
                <span>解组</span>
              </button>
              <button
                type="button"
                title="批量下载"
                className="flex h-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isImageResultGroup) {
                    downloadImageResultGroupZip();
                    return;
                  }
                  videoChildren.forEach((child) => onDownloadNode?.(child.id));
                }}
                disabled={
                  batchDownloading ||
                  (isImageResultGroup && completedImageChildren.length === 0)
                }
              >
                <StoryboardToolbarDownloadIcon />
                <span>{batchDownloading ? "打包中" : "批量下载"}</span>
              </button>
            </>
          ) : !isImageResultGroup ? (
            <>
              {canResumeStoryboardVideos ? (
                <>
                  <button
                    type="button"
                    title="从失败片段继续生成"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08]"
                    onClick={(event) => {
                      event.stopPropagation();
                      const failedIndex = Number(
                        failedStoryboardVideoChild?.data
                          ?.workflowStoryboardVideoSegmentIndex ?? 0,
                      );
                      onGenerateStoryboardVideos?.(
                        String(
                          node.data?.workflowStoryboardVideoSourceGroupId || "",
                        ),
                        {
                          modelId:
                            storyboardVideoModelId ||
                            String(
                              failedStoryboardVideoChild?.data?.modelId || "",
                            ),
                          aspectRatio:
                            storyboardVideoAspectRatio ||
                            String(
                              failedStoryboardVideoChild?.data?.aspectRatio ||
                                "",
                            ),
                          videoResolution:
                            storyboardVideoResolution ||
                            String(
                              failedStoryboardVideoChild?.data
                                ?.videoResolution || "",
                            ),
                          videoDuration:
                            storyboardVideoDuration ||
                            String(
                              failedStoryboardVideoChild?.data
                                ?.workflowStoryboardDuration ||
                                failedStoryboardVideoChild?.data
                                  ?.videoDuration ||
                                "",
                            ),
                          videoMethod:
                            storyboardVideoMethod ||
                            String(
                              failedStoryboardVideoChild?.data?.videoMethod ||
                                "",
                            ),
                          generationCount: storyboardVideoGenerationCount,
                          generateAudio: storyboardVideoGenerateAudio,
                          enableWebSearch: storyboardVideoWebSearch,
                          workflowExtraParameters:
                            storyboardVideoExtraParameters,
                          maxClipDurationSeconds:
                            selectedStoryboardVideoDurationSeconds,
                          outputGroupId: node.id,
                          startClipIndex: failedIndex,
                          resumeTailFrameUrl:
                            previousSuccessfulVideoTailFrameUrl,
                        },
                      );
                    }}
                  >
                    <RefreshCw className="size-4" />
                    <span>从失败处重试</span>
                  </button>
                  <div
                    className="mx-0.5 min-h-8 w-px shrink-0 self-stretch bg-white/10"
                    aria-hidden="true"
                  />
                </>
              ) : null}
              <button
                type="button"
                title="整组执行"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08]"
                onClick={(event) => {
                  event.stopPropagation();
                  onRunGroup?.(node.id);
                }}
              >
                <Play className="size-4" />
                <span>整组执行</span>
              </button>
              <button
                type="button"
                title={
                  canConvertToStoryboardGroup
                    ? "转分镜组"
                    : "组内全是普通图片时可转分镜组"
                }
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08] ${canConvertToStoryboardGroup ? "cursor-pointer" : "cursor-not-allowed opacity-45"}`}
                disabled={!canConvertToStoryboardGroup}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!canConvertToStoryboardGroup) return;
                  onConvertGroupToStoryboard?.(node.id);
                }}
              >
                <StoryboardGroupIcon className="size-4" />
                <span>转分镜组</span>
              </button>
              <button
                type="button"
                title="解组"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08]"
                onClick={(event) => {
                  event.stopPropagation();
                  onUngroupNode?.(node.id);
                }}
              >
                <UngroupIcon className="size-4" />
                <span>解组</span>
              </button>
              <button
                type="button"
                title="批量下载"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08]"
                onClick={(event) => {
                  event.stopPropagation();
                  ordinaryImageGroupChildren.forEach((child) =>
                    onDownloadNode?.(child.id),
                  );
                }}
              >
                <Download className="size-4" />
                <span>批量下载</span>
              </button>
            </>
          ) : null}
          {isImageResultGroup ? (
            <>
              {!isImageGeneratorResultGroup ? (
                <>
                  <button
                    type="button"
                    title="整组执行"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={running}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRunGroup?.(node.id);
                    }}
                  >
                    <Play
                      className={`size-4 ${running ? "animate-pulse" : ""}`}
                    />
                    <span>{running ? "生成中" : "整组执行"}</span>
                  </button>
                  <button
                    type="button"
                    title="批量生成视频"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setVideoBatchMode(true);
                    }}
                  >
                    <Share2 className="size-4" />
                    <span>批量生成视频</span>
                  </button>
                </>
              ) : null}
              <button
                type="button"
                title="批量下载"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/86 transition-colors hover:bg-white/[0.08]"
                onClick={(event) => {
                  event.stopPropagation();
                  downloadImageResultGroupZip();
                }}
                disabled={
                  batchDownloading || completedImageChildren.length === 0
                }
              >
                <Download className="size-4" />
                <span>{batchDownloading ? "打包中" : "批量下载"}</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {mediaPreviewOpen && primaryImageUrl ? (
        <WorkflowMediaFullscreenPreview
          kind="image"
          mediaUrl={primaryImageUrl}
          onClose={() => setMediaPreviewOpen(false)}
        />
      ) : null}

      {floatingMenuAnchor &&
      colorMenuOpen &&
      floatingMenuAnchor.type === "color"
        ? createPortal(
            <div
              className="canvas-theme-portal nodrag nopan nowheel fixed z-[5000] rounded-xl p-3 text-canvas-controls-text"
              style={{
                left: floatingMenuAnchor.left,
                top: floatingMenuAnchor.top,
                transform: "translateY(-100%) translateY(-8px)",
              }}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
            >
              <div
                className="grid grid-cols-5 gap-3"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "0.5px solid var(--canvas-controls-border, #363636)",
                  background: "var(--canvas-controls-bg, #262626)",
                  boxShadow: "rgba(0, 0, 0, 0.08) 0px 4px 10px 0px",
                  backdropFilter: "blur(16px)",
                  color: "var(--canvas-controls-text, #fff)",
                  width: "max-content",
                }}
              >
                {WORKFLOW_GROUP_COLOR_OPTIONS.map((color) => {
                  const isTransparent = color === "transparent";
                  const isSelected = isTransparent
                    ? resolvedBackground === "transparent"
                    : resolvedBackground === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      className="flex size-9 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
                      style={{
                        outline: isSelected ? "2px solid #05DFF6" : "none",
                        outlineOffset: 2,
                      }}
                      aria-label={
                        isTransparent ? "透明背景" : `背景色 ${color}`
                      }
                      onClick={(menuEvent) => {
                        menuEvent.stopPropagation();
                        onUpdateNode?.(node.id, {
                          groupBackgroundColor: color,
                        });
                        setColorMenuOpen(false);
                      }}
                    >
                      {isTransparent ? (
                        <span className="relative size-7 rounded-full border-2 border-white/12 bg-white/[0.08]">
                          <span className="absolute left-1/2 top-1/2 h-0.5 w-full -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-[#FF3B30]" />
                        </span>
                      ) : (
                        <span
                          className="size-7 rounded-full"
                          style={{ background: color }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {floatingMenuAnchor &&
      layoutMenuOpen &&
      floatingMenuAnchor.type === "layout"
        ? createPortal(
            <div
              className="canvas-theme-portal nodrag nopan nowheel fixed z-[5000]"
              style={{
                left: floatingMenuAnchor.left,
                top: floatingMenuAnchor.top,
                transform: "translate(-50%, -100%) translateY(-8px)",
              }}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
            >
              <div
                className="flex flex-col gap-1"
                style={{
                  padding: 4,
                  gap: 8,
                  borderRadius: 12,
                  border: "0.5px solid var(--canvas-controls-border, #363636)",
                  background: "var(--canvas-controls-bg, #262626)",
                  boxShadow: "rgba(0, 0, 0, 0.08) 0px 4px 10px 0px",
                  backdropFilter: "blur(16px)",
                  color: "var(--canvas-controls-text, #fff)",
                  width: "max-content",
                  minWidth: 120,
                }}
              >
                {(
                  [
                    ["grid", "宫格排列", StoryboardLayoutGridMenuIcon],
                    [
                      "horizontal",
                      "水平排列",
                      StoryboardLayoutHorizontalMenuIcon,
                    ],
                    ["vertical", "垂直排列", StoryboardLayoutVerticalMenuIcon],
                  ] as const
                ).map(([layout, label, Icon]) => (
                  <button
                    key={layout}
                    type="button"
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.10))]"
                    style={{ color: "var(--canvas-controls-text, #fff)" }}
                    onClick={(menuEvent) => {
                      menuEvent.stopPropagation();
                      applyImageResultLayout(layout);
                    }}
                  >
                    <Icon />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}

      <BatchStoryboardVideoModal
        open={
          videoBatchMode &&
          isImageResultGroup &&
          !node.data?.suppressGenerationBar
        }
        title={String(node.data?.title || title || "分镜图")}
        items={batchStoryboardVideoItems}
        modelId={storyboardVideoModelId}
        aspectRatio={storyboardVideoAspectRatio}
        videoResolution={storyboardVideoResolution}
        videoDuration={storyboardVideoDuration}
        videoMethod={storyboardVideoMethod}
        generationCount={storyboardVideoGenerationCount}
        generateAudio={storyboardVideoGenerateAudio}
        enableWebSearch={storyboardVideoWebSearch}
        workflowExtraParameters={storyboardVideoExtraParameters}
        onModelChange={(value) => {
          setStoryboardVideoModelId(value);
          onUpdateNode?.(node.id, { storyboardVideoModelId: value } as any);
        }}
        onAspectRatioChange={(value) => {
          setStoryboardVideoAspectRatio(value);
          onUpdateNode?.(node.id, { storyboardVideoAspectRatio: value } as any);
        }}
        onVideoResolutionChange={(value) => {
          setStoryboardVideoResolution(value);
          onUpdateNode?.(node.id, { storyboardVideoResolution: value } as any);
        }}
        onVideoDurationChange={(value) => {
          setStoryboardVideoDuration(value);
          onUpdateNode?.(node.id, { storyboardVideoDuration: value } as any);
        }}
        onVideoMethodChange={(value) => {
          setStoryboardVideoMethod(value);
          onUpdateNode?.(node.id, { storyboardVideoMethod: value } as any);
        }}
        onGenerationCountChange={(value) => {
          setStoryboardVideoGenerationCount(value);
          onUpdateNode?.(node.id, {
            storyboardVideoGenerationCount: value,
          } as any);
        }}
        onGenerateAudioChange={(value) => {
          setStoryboardVideoGenerateAudio(value);
          onUpdateNode?.(node.id, {
            storyboardVideoGenerateAudio: value,
          } as any);
        }}
        onEnableWebSearchChange={(value) => {
          setStoryboardVideoWebSearch(value);
          onUpdateNode?.(node.id, {
            storyboardVideoWebSearch: value,
          } as any);
        }}
        onWorkflowExtraParametersChange={(value) => {
          setStoryboardVideoExtraParameters(value);
          onUpdateNode?.(node.id, {
            storyboardVideoExtraParameters: value,
          } as any);
        }}
        onClose={() => setVideoBatchMode(false)}
        onConfirm={(request) => {
          const rowDurations = request.rowDurations;
          const firstDuration =
            request.videoDuration ||
            request.rowIndexes
              .map((rowIndex) => rowDurations[rowIndex])
              .find(Boolean) ||
            storyboardVideoDuration ||
            "";
          const maxClipDurationSeconds = Math.max(
            1,
            Number(String(firstDuration).replace(/[^\d.]/g, "")) ||
              Math.max(
                0,
                ...Object.values(rowDurations).map(
                  (value) => Number(String(value).replace(/[^\d.]/g, "")) || 0,
                ),
              ) ||
              selectedStoryboardVideoDurationSeconds,
          );
          setStoryboardVideoModelId(request.modelId);
          setStoryboardVideoAspectRatio(request.aspectRatio || "");
          setStoryboardVideoResolution(request.videoResolution || "");
          setStoryboardVideoDuration(firstDuration);
          setStoryboardVideoMethod(request.videoMethod || "");
          setStoryboardVideoGenerationCount(request.generationCount);
          setStoryboardVideoGenerateAudio(request.generateAudio);
          setStoryboardVideoWebSearch(request.enableWebSearch);
          setStoryboardVideoExtraParameters(request.workflowExtraParameters);
          onUpdateNode?.(node.id, {
            suppressGenerationBar: true,
            storyboardVideoModelId: request.modelId,
            storyboardVideoAspectRatio: request.aspectRatio,
            storyboardVideoResolution: request.videoResolution,
            storyboardVideoDuration: firstDuration,
            storyboardVideoMethod: request.videoMethod,
            storyboardVideoGenerationCount: request.generationCount,
            storyboardVideoGenerateAudio: request.generateAudio,
            storyboardVideoWebSearch: request.enableWebSearch,
            storyboardVideoExtraParameters: request.workflowExtraParameters,
          } as any);
          setVideoBatchMode(false);
          onGenerateStoryboardVideos?.(node.id, {
            modelId: request.modelId,
            aspectRatio: request.aspectRatio,
            videoResolution: request.videoResolution,
            videoDuration: firstDuration,
            videoMethod: request.videoMethod,
            generationCount: request.generationCount,
            generateAudio: request.generateAudio,
            enableWebSearch: request.enableWebSearch,
            workflowExtraParameters: request.workflowExtraParameters,
            rowIndexes: request.rowIndexes,
            rowDurations,
            deferGeneration: true,
            maxClipDurationSeconds,
            plannedClipCount: request.rowIndexes.length,
          });
        }}
      />

      {imageGroupCollapsed &&
      isImageGeneratorResultGroup &&
      !videoBatchMode &&
      !dragging &&
      !node.data?.suppressGenerationBar ? (
        <div
          className="node-floating-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 z-30 flex w-max -translate-x-1/2 flex-nowrap items-center gap-0"
          data-canvas-generator-root=""
          style={{ top: "calc(100% + 16px)" }}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
        >
          <NodeGenerationBar
            kind="image"
            modelId={node.data?.modelId}
            workflowEndpointMethod={node.data?.workflowEndpointMethod}
            selectedOptionId={node.data?.selectedOptionId}
            promptInputDisabled={node.data?.workflowPromptDisabled}
            promptPlaceholderText={node.data?.workflowPromptPlaceholder}
            prompt={String(node.data?.prompt || "")}
            onPromptChange={(value) =>
              onUpdateNode?.(node.id, { prompt: value })
            }
            onModelChange={(value) =>
              onUpdateNode?.(node.id, { modelId: value })
            }
            aspectRatio={node.data?.aspectRatio}
            imageSize={node.data?.imageSize}
            stylePreset={node.data?.stylePreset}
            generateAudio={node.data?.generateAudio}
            enableWebSearch={node.data?.enableWebSearch}
            generationCount={node.data?.generationCount}
            cameraControl={node.data?.cameraControl}
            workflowPortraitTextureSettings={
              node.data?.workflowPortraitTextureSettings
            }
            workflowExtraParameters={node.data?.workflowExtraParameters}
            onGenerationSettingsChange={(patch) =>
              onUpdateNode?.(node.id, patch)
            }
            projectId={projectId}
            upstreamNodes={upstreamNodes}
            referenceImages={
              Array.isArray(node.data?.referenceImages)
                ? node.data.referenceImages
                : []
            }
            referenceImageNodeIds={
              Array.isArray(node.data?.referenceImageNodeIds)
                ? node.data.referenceImageNodeIds
                : []
            }
            referenceImageRoles={
              Array.isArray(node.data?.referenceImageRoles)
                ? node.data.referenceImageRoles
                : []
            }
            onGenerate={async (promptDraft, settings) => {
              onUpdateNode?.(node.id, {
                ...(typeof promptDraft === "string"
                  ? { prompt: promptDraft }
                  : {}),
                ...settings,
                suppressGenerationBar: false,
              });
              const generationStarted = await onGenerateNode?.(
                node.id,
                promptDraft,
                settings,
              );
              if (generationStarted === false) {
                onUpdateNode?.(node.id, { suppressGenerationBar: false });
                return false;
              }
              return true;
            }}
          />
        </div>
      ) : null}

      {isImageResultGroup ? (
        <div
          className={`pointer-events-none h-full w-full rounded-2xl p-1 ${imageGroupCollapsed ? "overflow-hidden" : "overflow-visible"}`}
        >
          {dragging && isImageGeneratorResultGroup ? (
            <div className="absolute inset-1 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#202023] text-center text-white/62">
              <ImageIcon className="size-6 text-white/34" />
              <span className="text-[13px] font-medium">图片结果组</span>
              <span className="text-[11px] text-white/38">
                {completedImageChildren.length || imageChildren.length} 张
              </span>
            </div>
          ) : imageGeneratorRunning ? (
            <div className="absolute inset-1 overflow-hidden rounded-xl bg-[#202023]">
              <WorkflowImageGenerationPlaceholder
                progress={imageGeneratorProgress}
                label="生成中"
              />
            </div>
          ) : imageGroupCollapsed && primaryImageChild ? (
            <div className="absolute inset-0 overflow-visible rounded-xl">
              {completedImageChildren
                .slice(1, 3)
                .reverse()
                .map((child, reverseIndex) => {
                  const stackIndex = Math.min(
                    2,
                    completedImageChildren.slice(1, 3).length - reverseIndex,
                  );
                  const imageUrl = String(child.data?.mediaUrl || "").trim();
                  return (
                    <div
                      key={child.id}
                      className="absolute overflow-hidden rounded-xl border border-white/[0.10] bg-[#171717] shadow-[0_14px_32px_rgba(0,0,0,0.38)]"
                      style={{
                        left: stackIndex * WORKFLOW_IMAGE_GROUP_STACK_OFFSET_X,
                        top: stackIndex * WORKFLOW_IMAGE_GROUP_STACK_OFFSET_Y,
                        width: collapsedImageWidth,
                        height: collapsedImageHeight,
                        transform: `scale(${Math.max(0.93, 1 - stackIndex * 0.035)}) rotate(${stackIndex * 2.5}deg)`,
                        transformOrigin: "center center",
                        zIndex: stackIndex,
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  );
                })}
              <div
                className="absolute overflow-hidden rounded-xl border border-white/[0.14] bg-[#171717] shadow-[0_8px_20px_rgba(0,0,0,0.24)]"
                style={{
                  left: 0,
                  top: 0,
                  width: collapsedImageWidth,
                  height: collapsedImageHeight,
                  zIndex: 8,
                }}
              >
                <img
                  src={primaryImageUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                {completedImageChildren.length > 1 ? (
                  <button
                    type="button"
                    className="pointer-events-auto absolute right-2 top-2 z-20 inline-flex items-center justify-center gap-1 rounded-lg bg-black/65 p-2 text-[13px] leading-none text-white shadow-sm transition-colors hover:bg-black/78"
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpdateNode?.(node.id, { groupCollapsed: false });
                    }}
                  >
                    <ExpandCornersIcon />
                    <span>{completedImageChildren.length}张</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            imageChildren.map((child, index) => {
              const imageUrl = String(child.data?.mediaUrl || "").trim();
              const storyboardRowIndex = Number(
                child.data?.workflowStoryboardSourceRowIndex,
              );
              const storyboardNumber = Number.isFinite(storyboardRowIndex)
                ? storyboardRowIndex + 1
                : Number.isFinite(firstStoryboardIndex)
                  ? firstStoryboardIndex + index + 1
                  : index + 1;
              const childRunning = Boolean(
                child.data?.workflowGenerationRunning,
              );
              const childError = String(
                child.data?.workflowGenerationError || "",
              ).trim();
              const childNote = String(child.data?.note || "").trim();
              const rawChildProgress = Number(
                child.data?.workflowGenerationProgress,
              );
              const childProgress =
                resolveWorkflowEstimatedImageGenerationProgress(
                  child.data?.workflowGenerationStartedAt,
                  rawChildProgress,
                  generationProgressNow,
                );
              const childPercent =
                childProgress === undefined
                  ? null
                  : Math.max(1, Math.min(99, Math.round(childProgress * 100)));
              const imageGeneratorLayout = imageGeneratorDisplayLayouts.get(
                child.id,
              );
              const childLeft =
                isImageGeneratorResultGroup && imageGeneratorLayout
                  ? imageGeneratorLayout.x
                  : Number(child.x || 0) + 4;
              const childTop =
                isImageGeneratorResultGroup && imageGeneratorLayout
                  ? imageGeneratorLayout.y
                  : Number(child.y || 0) + 4;
              const childWidth = Math.max(
                1,
                isImageGeneratorResultGroup && imageGeneratorLayout
                  ? imageGeneratorLayout.width
                  : Number(child.width || 1) - 8,
              );
              const childHeight = Math.max(
                1,
                isImageGeneratorResultGroup && imageGeneratorLayout
                  ? imageGeneratorLayout.height
                  : Number(child.height || 1) - 8,
              );
              const isPrimaryImage = child.id === primaryImageChild?.id;
              const childLabel = isImageGeneratorResultGroup
                ? `图片 #${index + 1}`
                : `分镜 #${storyboardNumber}`;
              const childAlt = isImageGeneratorResultGroup
                ? `图片 ${index + 1}`
                : `分镜 ${storyboardNumber}`;
              const childSizeLabel =
                imageUrl && imageGeneratorLayout?.naturalLabel
                  ? imageGeneratorLayout.naturalLabel
                  : imageUrl
                    ? `${Math.round(childWidth)} x ${Math.round(childHeight)}`
                    : "";
              if (isImageGeneratorResultGroup) {
                return (
                  <div
                    key={child.id}
                    className="absolute overflow-hidden rounded-xl border border-white/[0.10] bg-[#171717] shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
                    style={{
                      left: childLeft,
                      top: childTop,
                      width: childWidth,
                      height: childHeight,
                    }}
                    title={childSizeLabel || childLabel}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={childAlt}
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#202023] px-4 text-center">
                        {childRunning ? (
                          <>
                            <span className="size-5 animate-spin rounded-full border-2 border-white/16 border-t-white/72" />
                            <span className="text-[13px] font-medium text-white/78">
                              生成中
                            </span>
                            <span className="text-[11px] text-white/42">
                              {childPercent === null
                                ? "生成中"
                                : `${childPercent}%`}
                            </span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="size-5 text-white/34" />
                            <span className="line-clamp-2 text-[13px] font-medium text-white/62">
                              {childError
                                ? "生成失败"
                                : childNote || "等待生成"}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {imageUrl ? (
                      <div className="pointer-events-auto absolute right-2 top-2 flex gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-black/65 p-2 text-[13px] leading-none text-white shadow-sm transition-colors hover:bg-black/78"
                          onPointerDown={stopWorkflowNodeChromeEvent}
                          onMouseDown={stopWorkflowNodeChromeEvent}
                          onClick={(event) => {
                            event.stopPropagation();
                            const link = document.createElement("a");
                            link.href = imageUrl;
                            link.download = `image-${index + 1}`;
                            link.click();
                          }}
                        >
                          <Download className="size-3.5" />
                          <span>下载</span>
                        </button>
                        {completedImageChildren.length > 1 && isPrimaryImage ? (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center gap-1 rounded-lg bg-black/65 p-2 text-[13px] leading-none text-white shadow-sm transition-colors hover:bg-black/78"
                            onPointerDown={stopWorkflowNodeChromeEvent}
                            onMouseDown={stopWorkflowNodeChromeEvent}
                            onClick={(event) => {
                              event.stopPropagation();
                              onUpdateNode?.(node.id, {
                                groupCollapsed: true,
                                mediaUrl: imageUrl,
                              });
                            }}
                          >
                            <Minimize2 className="size-3.5" />
                            <span>收起</span>
                          </button>
                        ) : null}
                        {!isPrimaryImage ? (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-lg bg-black/65 p-2 text-[13px] leading-none text-white shadow-sm transition-colors hover:bg-black/78"
                            onPointerDown={stopWorkflowNodeChromeEvent}
                            onMouseDown={stopWorkflowNodeChromeEvent}
                            onClick={(event) => {
                              event.stopPropagation();
                              onUpdateNode?.(node.id, { mediaUrl: imageUrl });
                            }}
                          >
                            设为主图
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }
              return (
                <div
                  key={child.id}
                  className={`absolute overflow-hidden ${isImageGeneratorResultGroup ? "rounded-xl" : "rounded-md"} bg-[#303033]`}
                  style={{
                    left: childLeft,
                    top: childTop,
                    width: childWidth,
                    height: childHeight,
                  }}
                >
                  <div className="flex h-7 w-full items-center justify-between bg-[#303033]/96 px-2 text-[12px] text-white/58">
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <ImageIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{childLabel}</span>
                    </span>
                    <span className="shrink-0 pl-2 tabular-nums text-white/42">
                      {imageUrl
                        ? childSizeLabel
                        : childRunning
                          ? childPercent === null
                            ? "生成中"
                            : `${childPercent}%`
                          : childError
                            ? "失败"
                            : "等待"}
                    </span>
                  </div>
                  <div className="relative h-[calc(100%-28px)] w-full overflow-hidden">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={childAlt}
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-white/[0.08] bg-[#202023] px-4 text-center">
                        {childRunning ? (
                          <>
                            <span className="size-5 animate-spin rounded-full border-2 border-white/16 border-t-white/72" />
                            <span className="text-[13px] font-medium text-white/78">
                              生成中
                            </span>
                            <span className="text-[11px] text-white/42">
                              {childPercent === null
                                ? "生成中"
                                : `${childPercent}%`}
                            </span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="size-5 text-white/34" />
                            <span className="line-clamp-2 text-[13px] font-medium text-white/62">
                              {childError
                                ? "生成失败"
                                : childNote || "等待生成"}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {imageUrl ? (
                      <div className="pointer-events-auto absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          className="inline-flex h-6 items-center gap-1 rounded bg-black/68 px-1.5 text-[11px] leading-none text-white/92 shadow-sm transition-colors hover:bg-black/82"
                          onPointerDown={stopWorkflowNodeChromeEvent}
                          onMouseDown={stopWorkflowNodeChromeEvent}
                          onClick={(event) => {
                            event.stopPropagation();
                            const link = document.createElement("a");
                            link.href = imageUrl;
                            link.download = `image-${index + 1}`;
                            link.click();
                          }}
                        >
                          <Download className="size-3" />
                          <span>下载</span>
                        </button>
                        {completedImageChildren.length > 1 && isPrimaryImage ? (
                          <button
                            type="button"
                            className="inline-flex h-6 items-center gap-1 rounded bg-black/68 px-1.5 text-[11px] leading-none text-white/92 shadow-sm transition-colors hover:bg-black/82"
                            onPointerDown={stopWorkflowNodeChromeEvent}
                            onMouseDown={stopWorkflowNodeChromeEvent}
                            onClick={(event) => {
                              event.stopPropagation();
                              onUpdateNode?.(node.id, {
                                groupCollapsed: true,
                                mediaUrl: imageUrl,
                              });
                            }}
                          >
                            <Minimize2 className="size-3" />
                            <span>收起</span>
                          </button>
                        ) : null}
                        {!isPrimaryImage ? (
                          <button
                            type="button"
                            className="inline-flex h-6 items-center rounded bg-black/68 px-1.5 text-[11px] leading-none text-white/92 shadow-sm transition-colors hover:bg-black/82"
                            onPointerDown={stopWorkflowNodeChromeEvent}
                            onMouseDown={stopWorkflowNodeChromeEvent}
                            onClick={(event) => {
                              event.stopPropagation();
                              onUpdateNode?.(node.id, { mediaUrl: imageUrl });
                            }}
                          >
                            设为主图
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div
          className="pointer-events-none relative h-full w-full overflow-hidden rounded-2xl p-4"
          style={{ background: resolvedBackground }}
        >
          {groupChildren.length === 0 ? (
            <div className="flex h-full w-full flex-col justify-between">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Box className="size-4" />
                <span>{childCount} 个节点</span>
              </div>
              <div className="flex items-center justify-between text-xs text-white/42">
                <span>{running ? "整组执行中" : "拖动组可移动整组"}</span>
                <span>Group</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
