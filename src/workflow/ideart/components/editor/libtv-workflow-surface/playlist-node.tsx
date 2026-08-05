"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStoreApi, type Edge, type Node } from "@xyflow/react";
import { List, Loader2, Plus, Play, Video, X } from "lucide-react";
import type {
  LibTvWorkflowNode,
  LibTvWorkflowPlaylistItem,
} from "@/workflow/ideart/lib/libtv/workflow";
import {
  resolveImageDownloadUrl,
  triggerBrowserDownload,
} from "@/workflow/ideart/lib/url/download-url";
import { requestWorkflowPlaylistExport } from "@/workflow/ideart/lib/libtv/playlist-export";
import { toVideoDisplayUrl } from "../utils/video-proxy";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  clampWorkflowNumber,
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  formatWorkflowMediaTime,
  getWorkflowImageRenderUrl,
  getWorkflowVideoPosterUrl,
  isRenderableWorkflowMediaUrl,
  parseWorkflowDurationSeconds,
} from "./workflow-media-utils";
import {
  CANVAS_CONTROLS_MENU_PANEL_STYLE,
  WORKFLOW_NODE_CLOSE_MENUS_EVENT,
} from "./surface-contracts";
import { getWorkflowNodeTitleWidth } from "./workflow-connections";
import type { WorkflowOverlayNodeData } from "./surface-contracts";

export function TapNowPlaylistNode({
  node,
  selected,
  onUpdateNode,
}: {
  node: LibTvWorkflowNode;
  selected: boolean;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
}) {
  const [title, setTitle] = useState(String(node.data?.title || "视频合成"));
  const [activeIndex, setActiveIndex] = useState(
    Math.max(0, Math.round(Number(node.data?.playlistActiveIndex || 0))),
  );
  const [playing, setPlaying] = useState(false);
  const [muted] = useState(true);
  const [globalTime, setGlobalTime] = useState(0);
  const [knownDurations, setKnownDurations] = useState<Record<string, number>>(
    {},
  );
  const [trimMode, setTrimMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [clipPickerOpen, setClipPickerOpen] = useState(false);
  const [clipCandidates, setClipCandidates] = useState<
    LibTvWorkflowPlaylistItem[]
  >([]);
  const [trimDraft, setTrimDraft] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trimDragRef = useRef<{
    pointerId: number;
    side: "start" | "end";
    rect: DOMRect;
    start: number;
    end: number;
  } | null>(null);
  const flowStore = useStoreApi<Node<WorkflowOverlayNodeData>, Edge>();
  const playlistItems = useMemo(
    () =>
      Array.isArray(node.data?.playlistItems)
        ? node.data.playlistItems
            .map((item, index) => ({
              id: String(item.id || item.nodeId || `${node.id}-${index}`),
              nodeId: item.nodeId,
              title: String(item.title || `视频 ${index + 1}`),
              mediaUrl: String(item.mediaUrl || "").trim(),
              thumbnailUrl: String(item.thumbnailUrl || "").trim(),
              duration:
                Number.isFinite(Number(item.duration)) &&
                Number(item.duration) > 0
                  ? Number(item.duration)
                  : undefined,
              trimStart:
                Number.isFinite(Number(item.trimStart)) &&
                Number(item.trimStart) >= 0
                  ? Number(item.trimStart)
                  : undefined,
              trimEnd:
                Number.isFinite(Number(item.trimEnd)) &&
                Number(item.trimEnd) > 0
                  ? Number(item.trimEnd)
                  : undefined,
            }))
            .filter((item) => isRenderableWorkflowMediaUrl(item.mediaUrl))
        : [],
    [node.data?.playlistItems, node.id],
  );
  const hasPlaylistItems = playlistItems.length > 0;
  const playlistExportUrl = String(
    node.data?.playlistExportUrl || node.data?.mediaUrl || "",
  ).trim();
  const playlistExportVideoSrc = playlistExportUrl
    ? toVideoDisplayUrl(playlistExportUrl)
    : "";
  const timelineSegments = useMemo(() => {
    let cursor = 0;
    return playlistItems.map((item, index) => {
      const sourceDuration = Math.max(
        0.5,
        knownDurations[item.id] || item.duration || 5,
      );
      const sourceStart = clampWorkflowNumber(
        Number(item.trimStart || 0),
        0,
        Math.max(0, sourceDuration - 0.05),
      );
      const sourceEnd = clampWorkflowNumber(
        Number(item.trimEnd || sourceDuration),
        sourceStart + 0.05,
        sourceDuration,
      );
      const duration = Math.max(0.05, sourceEnd - sourceStart);
      const start = cursor;
      cursor += duration;
      return {
        item,
        index,
        start,
        end: cursor,
        duration,
        sourceStart,
        sourceEnd,
      };
    });
  }, [knownDurations, playlistItems]);
  const totalDuration = timelineSegments.length
    ? timelineSegments[timelineSegments.length - 1].end
    : 0;
  const trimStart = clampWorkflowNumber(
    Number(node.data?.playlistTrimStart || 0),
    0,
    Math.max(0, totalDuration),
  );
  const trimEnd = clampWorkflowNumber(
    Number(node.data?.playlistTrimEnd || totalDuration || 0),
    trimStart || 0,
    Math.max(trimStart, totalDuration),
  );
  const displayedTrimStart = trimDraft?.start ?? trimStart;
  const displayedTrimEnd = trimDraft?.end ?? trimEnd;
  const playableStart = Math.min(
    displayedTrimStart,
    Math.max(0, totalDuration),
  );
  const playableEnd = Math.max(
    playableStart,
    displayedTrimEnd || totalDuration,
  );
  const safeGlobalTime = clampWorkflowNumber(
    globalTime || playableStart,
    playableStart,
    Math.max(playableStart, playableEnd),
  );
  const indexFromTime = useCallback(
    (time: number) => {
      if (!timelineSegments.length) return 0;
      const clamped = clampWorkflowNumber(
        time,
        0,
        Math.max(0, totalDuration - 0.001),
      );
      const found = timelineSegments.find(
        (segment) => clamped >= segment.start && clamped < segment.end,
      );
      return found?.index ?? timelineSegments.length - 1;
    },
    [timelineSegments, totalDuration],
  );
  const safeActiveIndex = hasPlaylistItems
    ? Math.min(Math.max(0, activeIndex), playlistItems.length - 1)
    : 0;
  const activeItem = playlistItems[safeActiveIndex] || null;
  const activeSegment = timelineSegments[safeActiveIndex] || null;
  const panelOpen = Boolean(node.data?.playlistPanelOpen && hasPlaylistItems);
  const activeVideoSrc = activeItem?.mediaUrl
    ? toVideoDisplayUrl(activeItem.mediaUrl)
    : "";
  const activePosterUrl = activeItem
    ? activeItem.thumbnailUrl || getWorkflowVideoPosterUrl(activeItem.mediaUrl)
    : "";
  const timelineWidth = Math.max(760, Math.min(200000, totalDuration * 90));
  const exportRunning = exporting || Boolean(node.data?.playlistExportRunning);
  const majorStep = totalDuration > 120 ? 10 : totalDuration > 60 ? 5 : 2;
  const minorStep = majorStep / 4;
  const minorTicks = useMemo(() => {
    if (!totalDuration) return [];
    const count = Math.min(240, Math.ceil(totalDuration / minorStep));
    return Array.from({ length: count + 1 }, (_, index) => {
      const time = Math.min(totalDuration, index * minorStep);
      return {
        time,
        major:
          Math.abs(time % majorStep) < 0.001 ||
          time === 0 ||
          Math.abs(time - totalDuration) < 0.001,
      };
    });
  }, [majorStep, minorStep, totalDuration]);
  const majorLabels = useMemo(() => {
    if (!totalDuration) return [];
    const count = Math.min(80, Math.ceil(totalDuration / majorStep));
    return Array.from({ length: count + 1 }, (_, index) =>
      Math.min(totalDuration, index * majorStep),
    );
  }, [majorStep, totalDuration]);

  useEffect(() => {
    setTitle(String(node.data?.title || "视频合成"));
  }, [node.data?.title]);

  useEffect(() => {
    setShowExportPreview(Boolean(playlistExportVideoSrc));
  }, [playlistExportVideoSrc]);

  useEffect(() => {
    setClipPickerOpen(false);
    setClipCandidates([]);
    setTrimDraft(null);
    trimDragRef.current = null;
  }, [node.id]);

  useEffect(() => {
    const closeClipPicker = () => setClipPickerOpen(false);
    window.addEventListener(WORKFLOW_NODE_CLOSE_MENUS_EVENT, closeClipPicker);
    return () =>
      window.removeEventListener(
        WORKFLOW_NODE_CLOSE_MENUS_EVENT,
        closeClipPicker,
      );
  }, []);

  useEffect(() => {
    setActiveIndex(
      Math.max(0, Math.round(Number(node.data?.playlistActiveIndex || 0))),
    );
  }, [node.data?.playlistActiveIndex]);

  useEffect(() => {
    const pauseForCanvasInteraction = () => videoRef.current?.pause();
    window.addEventListener(
      WORKFLOW_NODE_CLOSE_MENUS_EVENT,
      pauseForCanvasInteraction,
    );
    return () =>
      window.removeEventListener(
        WORKFLOW_NODE_CLOSE_MENUS_EVENT,
        pauseForCanvasInteraction,
      );
  }, []);

  useEffect(() => {
    if (!hasPlaylistItems) return;
    if (activeIndex > playlistItems.length - 1)
      setActiveIndex(playlistItems.length - 1);
  }, [activeIndex, hasPlaylistItems, playlistItems.length]);

  useEffect(() => {
    if (!hasPlaylistItems) {
      setGlobalTime(0);
      setPlaying(false);
      return;
    }
    setGlobalTime((value) =>
      clampWorkflowNumber(
        value || playableStart,
        playableStart,
        playableEnd || playableStart,
      ),
    );
  }, [hasPlaylistItems, playableEnd, playableStart]);

  useEffect(() => {
    if (!hasPlaylistItems) return;
    const nextIndex = indexFromTime(safeGlobalTime);
    if (nextIndex !== safeActiveIndex) {
      setActiveIndex(nextIndex);
      onUpdateNode?.(node.id, { playlistActiveIndex: nextIndex });
    }
  }, [
    hasPlaylistItems,
    indexFromTime,
    node.id,
    onUpdateNode,
    safeActiveIndex,
    safeGlobalTime,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    const segmentStart = activeSegment?.start || 0;
    const localTime =
      (activeSegment?.sourceStart || 0) +
      clampWorkflowNumber(
        safeGlobalTime - segmentStart,
        0,
        activeSegment?.duration || 0,
      );
    if (
      Number.isFinite(localTime) &&
      Math.abs(video.currentTime - localTime) > 0.45
    ) {
      video.currentTime = localTime;
    }
    if (playing && panelOpen) {
      void video.play().catch(() => setPlaying(false));
    }
  }, [
    activeSegment?.duration,
    activeSegment?.sourceStart,
    activeSegment?.start,
    activeVideoSrc,
    muted,
    panelOpen,
    playing,
    safeGlobalTime,
  ]);

  const getPlaylistClipCandidates = useCallback(() => {
    const existingNodeIds = new Set(
      playlistItems
        .map((item) => String(item.nodeId || "").trim())
        .filter(Boolean),
    );
    const existingMediaUrls = new Set(
      playlistItems
        .map((item) => String(item.mediaUrl || "").trim())
        .filter(Boolean),
    );
    return flowStore
      .getState()
      .nodes.map((flowNode) => flowNode.data?.workflowNode)
      .filter((workflowNode): workflowNode is LibTvWorkflowNode =>
        Boolean(workflowNode),
      )
      .filter((workflowNode) => {
        const mediaUrl = String(workflowNode.data?.mediaUrl || "").trim();
        return (
          workflowNode.id !== node.id &&
          workflowNode.kind === "video" &&
          isRenderableWorkflowMediaUrl(mediaUrl) &&
          !existingNodeIds.has(workflowNode.id) &&
          !existingMediaUrls.has(mediaUrl)
        );
      })
      .sort(
        (left, right) =>
          Number(left.y || 0) - Number(right.y || 0) ||
          Number(left.x || 0) - Number(right.x || 0),
      )
      .map((workflowNode) => ({
        id: workflowNode.id,
        nodeId: workflowNode.id,
        title: String(workflowNode.data?.title || "视频").trim() || "视频",
        mediaUrl: String(workflowNode.data?.mediaUrl || "").trim(),
        thumbnailUrl:
          String(workflowNode.data?.thumbnailUrl || "").trim() || undefined,
        duration: parseWorkflowDurationSeconds(
          workflowNode.data?.videoDuration ||
            workflowNode.data?.workflowStoryboardDuration,
          5,
        ),
      }));
  }, [flowStore, node.id, playlistItems]);

  const toggleClipPicker = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (clipPickerOpen) {
        setClipPickerOpen(false);
        return;
      }
      window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
      const candidates = getPlaylistClipCandidates();
      setClipCandidates(candidates);
      if (candidates.length === 0) {
        message.info("画布上暂无可添加的视频");
        return;
      }
      setClipPickerOpen(true);
    },
    [clipPickerOpen, getPlaylistClipCandidates],
  );

  const addPlaylistClip = useCallback(
    (event: React.MouseEvent, candidate: LibTvWorkflowPlaylistItem) => {
      event.stopPropagation();
      const candidateNodeId = String(
        candidate.nodeId || candidate.id || "",
      ).trim();
      const nextItem: LibTvWorkflowPlaylistItem = {
        ...candidate,
        id: `${node.id}-${candidateNodeId || playlistItems.length}-${playlistItems.length}`,
        nodeId: candidateNodeId || undefined,
      };
      onUpdateNode?.(node.id, {
        playlistItems: [...playlistItems, nextItem],
        playlistTrimEnd: undefined,
        playlistExportUrl: undefined,
        playlistExportRunning: false,
        mediaUrl: "",
      });
      setClipCandidates((items) =>
        items.filter(
          (item) => String(item.nodeId || item.id || "") !== candidateNodeId,
        ),
      );
      setClipPickerOpen(false);
    },
    [node.id, onUpdateNode, playlistItems],
  );

  const openPanel = useCallback(
    (event?: React.MouseEvent, time?: number) => {
      event?.stopPropagation();
      if (!hasPlaylistItems) return;
      const nextTime =
        typeof time === "number"
          ? clampWorkflowNumber(
              time,
              playableStart,
              playableEnd || playableStart,
            )
          : safeGlobalTime;
      const nextIndex = indexFromTime(nextTime);
      setGlobalTime(nextTime);
      setActiveIndex(nextIndex);
      onUpdateNode?.(node.id, {
        playlistPanelOpen: true,
        playlistActiveIndex: nextIndex,
      });
    },
    [
      hasPlaylistItems,
      indexFromTime,
      node.id,
      onUpdateNode,
      playableEnd,
      playableStart,
      safeGlobalTime,
    ],
  );

  const closePanel = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      setPlaying(false);
      onUpdateNode?.(node.id, { playlistPanelOpen: false });
    },
    [node.id, onUpdateNode],
  );

  const togglePlay = useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation();
      if (!panelOpen) {
        openPanel(event);
        return;
      }
      const video = videoRef.current;
      if (!video) {
        if (activeVideoSrc) setPlaying(true);
        return;
      }
      if (video.paused) {
        void video
          .play()
          .then(() => setPlaying(true))
          .catch(() => setPlaying(false));
      } else {
        video.pause();
        setPlaying(false);
      }
    },
    [activeVideoSrc, openPanel, panelOpen],
  );

  const handleTimelinePointer = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      if (!hasPlaylistItems) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio =
        rect.width > 0
          ? clampWorkflowNumber((event.clientX - rect.left) / rect.width, 0, 1)
          : 0;
      const nextTime = ratio * totalDuration;
      if (trimMode) {
        const distanceToStart = Math.abs(nextTime - trimStart);
        const distanceToEnd = Math.abs(nextTime - trimEnd);
        if (distanceToStart < distanceToEnd) {
          onUpdateNode?.(node.id, {
            playlistTrimStart: clampWorkflowNumber(
              nextTime,
              0,
              Math.max(0, trimEnd - 0.1),
            ),
          });
        } else {
          onUpdateNode?.(node.id, {
            playlistTrimEnd: clampWorkflowNumber(
              nextTime,
              Math.min(totalDuration, trimStart + 0.1),
              totalDuration,
            ),
          });
        }
        return;
      }
      openPanel(event, nextTime);
    },
    [
      hasPlaylistItems,
      node.id,
      onUpdateNode,
      openPanel,
      totalDuration,
      trimEnd,
      trimMode,
      trimStart,
    ],
  );

  const beginTrimDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, side: "start" | "end") => {
      event.preventDefault();
      event.stopPropagation();
      if (!trimMode || !totalDuration) return;
      const track = event.currentTarget.closest(
        "[data-playlist-timeline-interaction]",
      ) as HTMLElement | null;
      const rect = track?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const nextDraft = { start: displayedTrimStart, end: displayedTrimEnd };
      trimDragRef.current = {
        pointerId: event.pointerId,
        side,
        rect,
        ...nextDraft,
      };
      setTrimDraft(nextDraft);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [displayedTrimEnd, displayedTrimStart, totalDuration, trimMode],
  );

  const moveTrimDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = trimDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !totalDuration) return;
      event.preventDefault();
      event.stopPropagation();
      const ratio = clampWorkflowNumber(
        (event.clientX - drag.rect.left) / drag.rect.width,
        0,
        1,
      );
      const nextTime = ratio * totalDuration;
      if (drag.side === "start") {
        drag.start = clampWorkflowNumber(
          nextTime,
          0,
          Math.max(0, drag.end - 0.1),
        );
      } else {
        drag.end = clampWorkflowNumber(
          nextTime,
          Math.min(totalDuration, drag.start + 0.1),
          totalDuration,
        );
      }
      setTrimDraft({ start: drag.start, end: drag.end });
    },
    [totalDuration],
  );

  const finishTrimDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
      const drag = trimDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      trimDragRef.current = null;
      setTrimDraft(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (!cancelled) {
        onUpdateNode?.(
          node.id,
          drag.side === "start"
            ? { playlistTrimStart: drag.start }
            : { playlistTrimEnd: drag.end },
        );
      }
    },
    [node.id, onUpdateNode],
  );

  const nudgeTrimHandle = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, side: "start" | "end") => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const step = event.shiftKey ? 1 : Math.max(0.1, minorStep);
      if (side === "start") {
        onUpdateNode?.(node.id, {
          playlistTrimStart: clampWorkflowNumber(
            displayedTrimStart + direction * step,
            0,
            Math.max(0, displayedTrimEnd - 0.1),
          ),
        });
      } else {
        onUpdateNode?.(node.id, {
          playlistTrimEnd: clampWorkflowNumber(
            displayedTrimEnd + direction * step,
            Math.min(totalDuration, displayedTrimStart + 0.1),
            totalDuration,
          ),
        });
      }
    },
    [
      displayedTrimEnd,
      displayedTrimStart,
      minorStep,
      node.id,
      onUpdateNode,
      totalDuration,
    ],
  );

  const toggleTrimMode = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!hasPlaylistItems || !totalDuration) return;
      if (!trimMode) {
        onUpdateNode?.(node.id, {
          playlistTrimStart: trimStart,
          playlistTrimEnd: trimEnd || totalDuration,
          playlistPanelOpen: true,
        });
      }
      setTrimDraft(null);
      trimDragRef.current = null;
      setTrimMode((value) => !value);
    },
    [
      hasPlaylistItems,
      node.id,
      onUpdateNode,
      totalDuration,
      trimEnd,
      trimMode,
      trimStart,
    ],
  );

  const exportPlaylist = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!hasPlaylistItems || exportRunning) return;
      setExporting(true);
      onUpdateNode?.(node.id, { playlistExportRunning: true });
      try {
        const result = await requestWorkflowPlaylistExport({
          title,
          startSeconds: playableStart,
          endSeconds: playableEnd || totalDuration,
          backgroundAudioUrl: node.data?.playlistBackgroundAudioUrl,
          backgroundAudioVolume: node.data?.playlistBackgroundAudioVolume,
          voiceoverAudioUrl: node.data?.playlistVoiceoverUrl,
          voiceoverVolume: node.data?.playlistVoiceoverVolume,
          subtitles: node.data?.playlistSubtitles,
          items: playlistItems.map((item) => ({
            ...item,
            duration: knownDurations[item.id] || item.duration,
          })),
        });
        onUpdateNode?.(node.id, {
          playlistExportUrl: result.url,
          mediaUrl: "",
          playlistExportRunning: false,
          workflowMediaDurationSec: result.durationSeconds,
          workflowMediaNaturalWidth: result.width,
          workflowMediaNaturalHeight: result.height,
          workflowGenerationError: "",
        });
        setShowExportPreview(true);
        triggerBrowserDownload(
          resolveImageDownloadUrl(result.url),
          `${title.trim() || "视频合成"}.mp4`,
        );
        message.success("播放列表已合成");
      } catch (error) {
        onUpdateNode?.(node.id, { playlistExportRunning: false });
        message.error(
          error instanceof Error ? error.message : "播放列表导出失败",
        );
      } finally {
        setExporting(false);
      }
    },
    [
      exportRunning,
      hasPlaylistItems,
      knownDurations,
      node.id,
      onUpdateNode,
      playableEnd,
      playableStart,
      playlistItems,
      title,
      totalDuration,
    ],
  );

  const renderCutIcon = useCallback(
    () => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
        <path d="M17 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
        <path d="M9.15 14.85l8.85 -10.85" />
        <path d="M6 4l8.85 10.85" />
      </svg>
    ),
    [],
  );

  const renderDownloadIcon = useCallback(
    () => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
        <path d="M7 11l5 5l5 -5" />
        <path d="M12 4l0 12" />
      </svg>
    ),
    [],
  );

  const renderTimeline = useCallback(
    (variant: "node" | "panel") => {
      const isPanel = variant === "panel";
      const widthStyle: React.CSSProperties = isPanel
        ? { width: "100%", minWidth: "100%" }
        : { width: timelineWidth, minWidth: timelineWidth };
      const playheadLeft =
        totalDuration > 0 ? (safeGlobalTime / totalDuration) * 100 : 0;
      const trimLeft =
        totalDuration > 0 ? (displayedTrimStart / totalDuration) * 100 : 0;
      const trimRight =
        totalDuration > 0
          ? Math.max(0, 100 - (displayedTrimEnd / totalDuration) * 100)
          : 0;
      return (
        <div className="relative flex h-full min-h-0 w-full flex-col overflow-visible">
          <div
            className="relative h-6 w-full shrink-0 overflow-visible"
            style={widthStyle}
          >
            <div className="pointer-events-none z-[24] flex w-full min-w-0 shrink-0 flex-col">
              <div className="relative h-3 w-full shrink-0">
                {minorTicks.map((tick, index) => (
                  <div
                    key={`${variant}-tick-${index}`}
                    className={`absolute top-0 w-px ${tick.major ? "h-1.5 bg-fg-muted" : "h-0.5 bg-fg-disabled"}`}
                    style={{
                      left: `${totalDuration > 0 ? (tick.time / totalDuration) * 100 : 0}%`,
                      transform: "translateX(-50%)",
                    }}
                  />
                ))}
              </div>
              <div className="relative h-3 w-full shrink-0">
                {majorLabels.map((time, index) => (
                  <span
                    key={`${variant}-label-${index}`}
                    className="absolute -top-px text-[9px] font-medium leading-none text-fg-muted tabular-nums"
                    style={{
                      left: `${totalDuration > 0 ? (time / totalDuration) * 100 : 0}%`,
                      transform:
                        index === 0
                          ? "translateX(6px)"
                          : index === majorLabels.length - 1
                            ? "translateX(calc(-100% - 6px))"
                            : "translateX(calc(-50% + 9px))",
                    }}
                  >
                    {formatWorkflowMediaTime(time)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div
            className="relative flex min-h-0 shrink-0 flex-1 flex-col"
            style={widthStyle}
          >
            <div
              data-playlist-timeline-track-root="true"
              className="flex min-h-0 min-w-0 flex-1 flex-col justify-center"
            >
              <div
                data-playlist-timeline-track-hitbox="true"
                className="w-full shrink-0"
                style={{ height: isPanel ? 82 : 85 }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  data-playlist-timeline-interaction="true"
                  className="nodrag nowheel nopan relative h-full w-full min-w-0 shrink-0 cursor-pointer border-0 bg-transparent p-0 text-left outline-none"
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={handleTimelinePointer}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    openPanel(undefined, safeGlobalTime);
                  }}
                >
                  <div className="relative flex h-full min-h-0 w-full min-w-0 items-stretch overflow-visible">
                    <div className="relative min-h-0 w-full flex-1">
                      <div className="absolute inset-0 z-[5]">
                        {timelineSegments.map((segment) => {
                          const left =
                            totalDuration > 0
                              ? (segment.start / totalDuration) * 100
                              : 0;
                          const width =
                            totalDuration > 0
                              ? (segment.duration / totalDuration) * 100
                              : 0;
                          const poster =
                            segment.item.thumbnailUrl ||
                            getWorkflowVideoPosterUrl(segment.item.mediaUrl);
                          return (
                            <div
                              key={segment.item.id}
                              data-segment="true"
                              data-segment-index={segment.index}
                              data-playlist-segment-index={segment.index}
                              className={`absolute bottom-[2px] top-[2px] cursor-grab overflow-hidden rounded-md border bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_8px_rgba(0,0,0,0.35)] transition-[left,right] [transition-duration:280ms] [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] active:cursor-grabbing ${segment.index === safeActiveIndex ? "border-[var(--canvas-node-border-selected)]" : "border-[var(--canvas-node-border)]"}`}
                              style={{
                                left: `${left}%`,
                                right: `calc(${Math.max(0, 100 - left - width)}% + 2px)`,
                              }}
                            >
                              <div className="absolute inset-0 overflow-hidden">
                                {poster ? (
                                  <div
                                    className="absolute inset-0 bg-cover bg-center opacity-95"
                                    style={{
                                      backgroundImage: `url("${getWorkflowImageRenderUrl(poster)}")`,
                                    }}
                                  />
                                ) : (
                                  <div className="absolute inset-0 bg-gradient-to-br from-[#3A3A3A] to-[#151515]" />
                                )}
                                <div className="absolute inset-0 z-[1] bg-gradient-to-b from-white/10 to-transparent" />
                                <div className="absolute inset-x-0 bottom-0 z-[2] h-9 bg-gradient-to-t from-black/55 to-transparent" />
                                <span className="absolute bottom-1.5 left-1.5 z-[3] max-w-[calc(100%-12px)] truncate text-[9px] font-medium leading-none text-white/85">
                                  {segment.item.title}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {trimMode ? (
                          <>
                            <div
                              className="pointer-events-none absolute inset-y-0 left-0 z-[18] bg-black/55"
                              style={{ width: `${trimLeft}%` }}
                            />
                            <div
                              className="pointer-events-none absolute inset-y-0 right-0 z-[18] bg-black/55"
                              style={{ width: `${trimRight}%` }}
                            />
                            <button
                              type="button"
                              className="nodrag nowheel nopan absolute bottom-0 top-0 z-[28] w-4 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 outline-none"
                              style={{ left: `${trimLeft}%` }}
                              data-playlist-trim-handle="start"
                              aria-label="裁剪起点"
                              aria-valuemin={0}
                              aria-valuemax={Math.max(
                                0,
                                displayedTrimEnd - 0.1,
                              )}
                              aria-valuenow={displayedTrimStart}
                              aria-valuetext={formatWorkflowMediaTime(
                                displayedTrimStart,
                              )}
                              role="slider"
                              onClick={stopWorkflowNodeChromeEvent}
                              onPointerDown={(event) =>
                                beginTrimDrag(event, "start")
                              }
                              onPointerMove={moveTrimDrag}
                              onPointerUp={(event) => finishTrimDrag(event)}
                              onPointerCancel={(event) =>
                                finishTrimDrag(event, true)
                              }
                              onKeyDown={(event) =>
                                nudgeTrimHandle(event, "start")
                              }
                            >
                              <span className="absolute bottom-0 left-1/2 top-0 w-1 -translate-x-1/2 rounded bg-[#FACC15] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
                              <span className="absolute left-1/2 top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/35 bg-[#FACC15]" />
                            </button>
                            <button
                              type="button"
                              className="nodrag nowheel nopan absolute bottom-0 top-0 z-[28] w-4 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0 outline-none"
                              style={{ left: `${100 - trimRight}%` }}
                              data-playlist-trim-handle="end"
                              aria-label="裁剪终点"
                              aria-valuemin={Math.min(
                                totalDuration,
                                displayedTrimStart + 0.1,
                              )}
                              aria-valuemax={totalDuration}
                              aria-valuenow={displayedTrimEnd}
                              aria-valuetext={formatWorkflowMediaTime(
                                displayedTrimEnd,
                              )}
                              role="slider"
                              onClick={stopWorkflowNodeChromeEvent}
                              onPointerDown={(event) =>
                                beginTrimDrag(event, "end")
                              }
                              onPointerMove={moveTrimDrag}
                              onPointerUp={(event) => finishTrimDrag(event)}
                              onPointerCancel={(event) =>
                                finishTrimDrag(event, true)
                              }
                              onKeyDown={(event) =>
                                nudgeTrimHandle(event, "end")
                              }
                            >
                              <span className="absolute bottom-0 left-1/2 top-0 w-1 -translate-x-1/2 rounded bg-[#FACC15] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
                              <span className="absolute left-1/2 top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/35 bg-[#FACC15]" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 bottom-[-24px] z-[26] min-h-0 overflow-x-visible overflow-y-hidden opacity-100 transition-opacity duration-150"
              aria-hidden="true"
            >
              <div className="relative h-full min-h-0" style={widthStyle}>
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{
                    left: `${playheadLeft}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div
                    className="absolute left-1/2 top-0 -translate-x-1/2 bg-fg-default"
                    style={{
                      width: 6,
                      height: 9.67,
                      borderRadius: "8px 8px 99px 99px",
                    }}
                  />
                  <div className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-fg-default shadow-[0_0_4px_rgba(127,127,127,0.5)]" />
                </div>
                <div
                  className="absolute top-0 bottom-0 flex w-max flex-col items-center pointer-events-none"
                  style={{
                    left: `${playheadLeft}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="w-max shrink-0" style={{ marginTop: 24 }}>
                    <div className="inline-flex h-3.5 min-h-3.5 items-center justify-center whitespace-nowrap rounded border border-white/30 bg-[#4a4a4a]/95 px-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.5)]">
                      <span className="text-[8px] font-medium leading-none text-white/95 tabular-nums">
                        {formatWorkflowMediaTime(safeGlobalTime)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    },
    [
      beginTrimDrag,
      displayedTrimEnd,
      displayedTrimStart,
      finishTrimDrag,
      handleTimelinePointer,
      majorLabels,
      minorTicks,
      moveTrimDrag,
      nudgeTrimHandle,
      openPanel,
      safeActiveIndex,
      safeGlobalTime,
      timelineSegments,
      timelineWidth,
      totalDuration,
      trimMode,
    ],
  );

  const renderPlaylistPlayer = useCallback(
    () => (
      <div
        className="absolute bottom-[calc(100%+16px)] left-0 z-[30] w-full overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl"
        data-playlist-player-for={node.id}
        aria-hidden={!panelOpen}
        style={{
          aspectRatio: "16 / 9",
          visibility: panelOpen ? "visible" : "hidden",
          pointerEvents: panelOpen ? "auto" : "none",
          opacity: panelOpen ? 1 : 0,
          transform: panelOpen
            ? "translateY(0px) scale(1)"
            : "translateY(10px) scale(0.985)",
          transition:
            "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease-out, visibility 220ms ease-out",
        }}
        onPointerDown={stopWorkflowNodeChromeEvent}
        onMouseDown={stopWorkflowNodeChromeEvent}
        onClick={stopWorkflowNodeChromeEvent}
        onContextMenu={preventWorkflowNodeChromeContextMenu}
      >
        <button
          type="button"
          className="nodrag relative h-full w-full overflow-hidden border-0 bg-black p-0 text-left outline-none"
          aria-label={playing ? "暂停播放列表" : "播放播放列表"}
          onClick={togglePlay}
        >
          {activeVideoSrc && panelOpen ? (
            <video
              ref={videoRef}
              key={activeItem?.id || activeVideoSrc}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${playing ? "opacity-100" : "opacity-0"}`}
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              muted={muted}
              src={activeVideoSrc}
              onLoadedMetadata={(event) => {
                const duration = Number(
                  event.currentTarget.duration || activeItem?.duration || 0,
                );
                if (
                  activeItem?.id &&
                  Number.isFinite(duration) &&
                  duration > 0
                ) {
                  setKnownDurations((value) =>
                    value[activeItem.id!] === duration
                      ? value
                      : { ...value, [activeItem.id!]: duration },
                  );
                }
                if (activeSegment) {
                  event.currentTarget.currentTime =
                    activeSegment.sourceStart +
                    clampWorkflowNumber(
                      safeGlobalTime - activeSegment.start,
                      0,
                      activeSegment.duration,
                    );
                }
                if (playing)
                  void event.currentTarget
                    .play()
                    .catch(() => setPlaying(false));
              }}
              onTimeUpdate={(event) => {
                if (!activeSegment) return;
                const sourceTime = Number(event.currentTarget.currentTime || 0);
                const nextTime = clampWorkflowNumber(
                  activeSegment.start +
                    Math.max(0, sourceTime - activeSegment.sourceStart),
                  playableStart,
                  playableEnd || totalDuration,
                );
                setGlobalTime(nextTime);
                if (
                  nextTime >= playableEnd - 0.05 &&
                  playableEnd > playableStart
                ) {
                  event.currentTarget.pause();
                  setPlaying(false);
                } else if (
                  sourceTime >= activeSegment.sourceEnd - 0.05 &&
                  safeActiveIndex + 1 < playlistItems.length
                ) {
                  const nextSegmentTime = activeSegment.end + 0.001;
                  setGlobalTime(nextSegmentTime);
                  setActiveIndex(safeActiveIndex + 1);
                  setPlaying(true);
                  onUpdateNode?.(node.id, {
                    playlistActiveIndex: safeActiveIndex + 1,
                  });
                }
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                if (!activeSegment) return;
                const nextTime = activeSegment.end + 0.001;
                if (
                  nextTime < playableEnd &&
                  safeActiveIndex + 1 < playlistItems.length
                ) {
                  setGlobalTime(nextTime);
                  setActiveIndex(safeActiveIndex + 1);
                  setPlaying(true);
                  onUpdateNode?.(node.id, {
                    playlistActiveIndex: safeActiveIndex + 1,
                  });
                } else {
                  setGlobalTime(playableEnd || totalDuration);
                  setPlaying(false);
                }
              }}
            />
          ) : null}
          {!playing ? (
            activePosterUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url("${getWorkflowImageRenderUrl(activePosterUrl)}")`,
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-[#050505]" />
            )
          ) : null}
          <span
            className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity ${playing ? "opacity-0" : "opacity-100"}`}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
              <Play className="ml-1 size-7 fill-current" />
            </span>
          </span>
        </button>
        <button
          className="nodrag absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-black/20 p-0 text-white transition-colors hover:bg-black/35 hover:text-white/85"
          type="button"
          title="关闭"
          onClick={closePanel}
        >
          <X className="size-[18px]" />
        </button>
      </div>
    ),
    [
      activeItem?.duration,
      activeItem?.id,
      activePosterUrl,
      activeSegment,
      activeVideoSrc,
      closePanel,
      muted,
      node.id,
      onUpdateNode,
      panelOpen,
      playableEnd,
      playableStart,
      playing,
      playlistItems.length,
      safeActiveIndex,
      safeGlobalTime,
      togglePlay,
      totalDuration,
    ],
  );

  return (
    <div
      ref={rootRef}
      className="group node-shell node-suppress-handle-plus-hover relative h-full w-full cursor-grab overflow-visible rounded-[12px] bg-transparent text-fg-default active:cursor-grabbing"
      data-testid={`canvas-node-playlist-${node.id}`}
      style={{ minWidth: 250, minHeight: 125 }}
    >
      <div
        className="pointer-events-auto absolute left-0 top-[-30px] z-[10] flex h-[22px] w-fit max-w-[min(360px,calc(100vw-32px))] items-center gap-1 overflow-hidden whitespace-nowrap rounded-full border border-[var(--canvas-controls-border)] bg-[var(--canvas-controls-bg)] px-2 text-left text-fg-muted shadow-[var(--canvas-shadow-dropdown)] backdrop-blur-sm"
        style={{ fontSize: 12, lineHeight: "18px" }}
      >
        <span
          className="flex shrink-0 items-center text-fg-muted"
          style={{ width: 13, height: 13 }}
        >
          <TapNowNodeIcon kind="playlist" size={13} />
        </span>
        <div
          className="relative min-w-0 max-w-full shrink"
          style={{ width: getWorkflowNodeTitleWidth(title || "视频合成", 4) }}
        >
          <span
            className="pointer-events-none invisible inline-block select-none whitespace-pre align-top"
            aria-hidden="true"
            style={{ fontSize: 15.2, lineHeight: "22.8px" }}
          >
            {title || "视频合成"}
          </span>
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
              onUpdateNode?.(node.id, { title: title.trim() || "视频合成" })
            }
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            style={{ fontSize: 12, lineHeight: "18px", minWidth: 0 }}
          />
        </div>
      </div>

      <div className="relative z-0 h-full min-h-0 w-full">
        {renderPlaylistPlayer()}
        <div
          data-playlist-export-anchor={node.id}
          className="pointer-events-auto absolute -left-[58px] top-1/2 z-[40] -translate-y-1/2"
        >
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              className={`flex items-center justify-center rounded-lg text-fg-default transition-colors ${trimMode ? "bg-canvas-controls-active" : "bg-canvas-controls-hover hover:bg-canvas-controls-active"}`}
              aria-label="切割"
              title="切割"
              style={{ height: 50, width: 50 }}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={toggleTrimMode}
            >
              {renderCutIcon()}
            </button>
            <button
              type="button"
              className="flex items-center justify-center rounded-lg bg-canvas-controls-hover text-fg-default transition-colors hover:bg-canvas-controls-active disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="导出视频合成"
              title="导出视频合成"
              disabled={!hasPlaylistItems || exportRunning}
              style={{ height: 50, width: 50 }}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={exportPlaylist}
            >
              {exportRunning ? (
                <Loader2 className="size-[22px] animate-spin" />
              ) : (
                renderDownloadIcon()
              )}
            </button>
          </div>
        </div>
        <div
          className={`pointer-events-none absolute inset-0 z-0 flex min-h-0 cursor-grab select-none flex-row flex-nowrap items-stretch gap-3 overflow-hidden rounded-2xl bg-[var(--Surface-secondary-background)] px-4 pb-4 pt-0 active:cursor-grabbing ${selected ? "ring-1 ring-[rgba(0,219,205,0.68)]" : "ring-1 ring-[rgba(0,219,205,0.24)] hover:ring-[rgba(0,219,205,0.62)]"}`}
          data-playlist-node-body={node.id}
          data-playlist-interaction-mode="drag"
        >
          {hasPlaylistItems ? (
            playlistExportVideoSrc && showExportPreview ? (
              <div className="nodrag nowheel nopan relative flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
                <video
                  className="h-full w-full object-contain"
                  src={playlistExportVideoSrc}
                  controls
                  playsInline
                  preload="metadata"
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={stopWorkflowNodeChromeEvent}
                />
                <button
                  type="button"
                  className="pointer-events-auto absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm hover:bg-black/75"
                  title="返回时间线"
                  aria-label="返回时间线"
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowExportPreview(false);
                  }}
                >
                  <List className="size-4" />
                </button>
              </div>
            ) : (
              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row flex-nowrap items-stretch gap-3">
                <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col nodrag nowheel nopan cursor-pointer">
                  <div className="relative flex min-h-0 flex-1 flex-col">
                    {playlistExportVideoSrc ? (
                      <button
                        type="button"
                        className="pointer-events-auto absolute right-2 top-2 z-30 flex size-8 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm hover:bg-black/75"
                        title="查看合成视频"
                        aria-label="查看合成视频"
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowExportPreview(true);
                        }}
                      >
                        <Video className="size-4" />
                      </button>
                    ) : null}
                    <div
                      data-playlist-timeline-viewport="true"
                      className="nodrag nowheel nopan relative box-border flex min-h-0 w-full flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:h-0"
                    >
                      <div
                        className="relative flex h-full min-h-0 min-w-full shrink-0 flex-col"
                        style={{
                          width: timelineWidth,
                          minWidth: timelineWidth,
                        }}
                      >
                        {renderTimeline("node")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 items-center px-3 text-xl text-fg-muted">
              空空如也，请连接视频节点后操作
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-[72px]"
            aria-hidden="true"
            style={{
              left: -12,
              background: "var(--workflow-playlist-edge-fade-left)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-[72px]"
            aria-hidden="true"
            style={{
              right: -6,
              background: "var(--workflow-playlist-edge-fade-right)",
            }}
          />
          <div className="pointer-events-none flex flex-none items-end self-stretch pb-4">
            <button
              type="button"
              data-playlist-action-item=""
              className="pointer-events-auto box-border flex h-[85px] min-h-0 w-[80px] min-w-[72px] max-w-none shrink-0 items-center justify-center rounded-xl border border-[var(--canvas-node-border)] bg-bg-surface-secondary text-fg-default transition-colors hover:bg-canvas-controls-hover disabled:pointer-events-none disabled:opacity-50"
              title="添加片段"
              aria-label="添加片段"
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              aria-expanded={clipPickerOpen}
              aria-haspopup="listbox"
              data-testid="canvas-node-playlist-add-clip"
              onClick={toggleClipPicker}
            >
              <Plus className="size-8" strokeWidth={1.25} />
            </button>
          </div>
        </div>
        {clipPickerOpen ? (
          <div
            className="node-float-ui nodrag nowheel nopan pointer-events-auto absolute right-0 top-[calc(100%+12px)] z-[60] w-[320px] overflow-hidden rounded-2xl p-1.5 text-canvas-controls-text"
            style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
            role="listbox"
            aria-label="添加视频片段"
            data-testid="canvas-node-playlist-clip-picker"
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
          >
            <div className="flex h-9 items-center justify-between px-2 text-xs font-medium text-fg-muted">
              <span>添加画布视频</span>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
                aria-label="关闭片段选择"
                onClick={(event) => {
                  event.stopPropagation();
                  setClipPickerOpen(false);
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="max-h-[260px] overflow-y-auto">
              {clipCandidates.map((candidate) => {
                const poster = String(
                  candidate.thumbnailUrl ||
                    getWorkflowVideoPosterUrl(candidate.mediaUrl) ||
                    "",
                ).trim();
                return (
                  <button
                    key={String(
                      candidate.nodeId || candidate.id || candidate.mediaUrl,
                    )}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-canvas-controls-hover"
                    onClick={(event) => addPlaylistClip(event, candidate)}
                  >
                    <span className="relative h-12 w-[76px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/45">
                      {poster ? (
                        <span
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(\"${getWorkflowImageRenderUrl(poster, 192)}\")`,
                          }}
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-white/35">
                          <Video className="size-5" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg-default">
                        {candidate.title || "视频"}
                      </span>
                      <span className="mt-1 block text-[11px] text-fg-subtle">
                        {formatWorkflowMediaTime(
                          Number(candidate.duration || 0),
                        )}
                      </span>
                    </span>
                    <Plus className="size-4 shrink-0 text-fg-muted" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
