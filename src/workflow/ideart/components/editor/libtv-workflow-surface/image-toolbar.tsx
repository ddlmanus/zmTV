"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Scissors } from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  VideoToolbarAnalyzeIcon,
  VideoToolbarAudioSeparationMenu,
  VideoToolbarButton,
  VideoToolbarCropIcon,
  VideoToolbarDownloadIcon,
  VideoToolbarExpandIcon,
  VideoToolbarHdIcon,
  VideoToolbarIconButton,
  VideoToolbarMenu,
} from "./video-toolbar";
import { AudioSeparateIcon, SubtitleRemoveIcon } from "./workflow-icons";
import {
  WORKFLOW_IMAGE_PRESET_GROUP_LOOKUP,
  WORKFLOW_IMAGE_TOOLBAR_PRESET_OPTIONS,
} from "./workflow-connections";
import { CANVAS_CONTROLS_MENU_PANEL_STYLE } from "./surface-contracts";
import type { OrdinaryImageToolbarAction } from "./surface-contracts";
import type { WorkflowImagePresetOption } from "./workflow-models";

export type OrdinaryImageToolbarActionOptions = {
  gridRows?: number;
  gridColumns?: number;
};

export function OrdinaryImageToolbar({
  kind = "image",
  onAction,
  onImagePreset,
  placement = "canvas",
  visibility = "always",
}: {
  kind?: LibTvWorkflowNode["kind"];
  onAction?: (
    action: OrdinaryImageToolbarAction,
    options?: OrdinaryImageToolbarActionOptions,
  ) => void;
  onImagePreset?: (presetId: string) => void;
  placement?: "canvas" | "inline";
  visibility?: "always" | "hover";
}) {
  const [videoMenuOpen, setVideoMenuOpen] = useState<
    "subtitle" | "audio" | null
  >(null);
  const [portraitTextureOpen, setPortraitTextureOpen] = useState(false);
  const [imagePresetOpen, setImagePresetOpen] = useState(false);
  const [primaryToolOpen, setPrimaryToolOpen] = useState(false);
  const [gridSplitOpen, setGridSplitOpen] = useState(false);
  const [downloadRunning, setDownloadRunning] = useState(false);
  const downloadResetTimerRef = useRef<number | null>(null);
  const isVideoToolbar = kind === "video";
  const runAction = useCallback(
    (
      action: OrdinaryImageToolbarAction,
      options?: OrdinaryImageToolbarActionOptions,
    ) => {
      setVideoMenuOpen(null);
      setPortraitTextureOpen(false);
      setImagePresetOpen(false);
      setPrimaryToolOpen(false);
      setGridSplitOpen(false);
      onAction?.(action, options);
    },
    [onAction],
  );
  const runDownloadAction = useCallback(() => {
    if (downloadRunning) return;
    if (downloadResetTimerRef.current !== null) {
      window.clearTimeout(downloadResetTimerRef.current);
      downloadResetTimerRef.current = null;
    }
    setDownloadRunning(true);
    runAction("download");
    downloadResetTimerRef.current = window.setTimeout(() => {
      downloadResetTimerRef.current = null;
      setDownloadRunning(false);
    }, 1600);
  }, [downloadRunning, runAction]);
  const runImagePreset = useCallback(
    (presetId: string) => {
      setVideoMenuOpen(null);
      setPortraitTextureOpen(false);
      setImagePresetOpen(false);
      setPrimaryToolOpen(false);
      setGridSplitOpen(false);
      onImagePreset?.(presetId);
    },
    [onImagePreset],
  );

  useEffect(
    () => () => {
      if (downloadResetTimerRef.current !== null) {
        window.clearTimeout(downloadResetTimerRef.current);
        downloadResetTimerRef.current = null;
      }
    },
    [],
  );

  if (isVideoToolbar) {
    return (
      <div
        className={
          placement === "inline"
            ? "node-floating-ui nodrag nowheel nopan pointer-events-auto relative z-20 flex w-max cursor-default items-center whitespace-nowrap"
            : `node-floating-ui nodrag nowheel nopan pointer-events-auto absolute left-1/2 z-20 flex origin-bottom cursor-default items-center whitespace-nowrap transition-[transform,opacity] duration-150 ease-out ${visibility === "hover" ? "opacity-0 group-hover/media:opacity-100 group-focus-within/media:opacity-100" : ""}`
        }
        data-testid="canvas-node-toolbar"
        style={
          placement === "inline"
            ? undefined
            : {
                // The toolbar is inverse-scaled so it keeps a stable screen size.
                // Its gap needs the same inverse compensation; otherwise the visual
                // distance collapses as the canvas zooms out and the toolbar covers
                // the floating node title.
                bottom:
                  "calc(100% + calc(32px * var(--workflow-float-scale, 1)))",
                transform:
                  "translateX(-50%) scale(var(--workflow-float-scale, 1))",
                transformOrigin: "center bottom",
              }
        }
        onPointerDown={stopWorkflowNodeChromeEvent}
        onMouseDown={stopWorkflowNodeChromeEvent}
        onClick={stopWorkflowNodeChromeEvent}
        onContextMenu={preventWorkflowNodeChromeContextMenu}
      >
        <div className="flex w-max items-center">
          <div
            className="flex items-center justify-center gap-1"
            style={{
              padding: 4,
              borderRadius: 12,
              border: "0.5px solid var(--canvas-controls-border)",
              background: "var(--canvas-controls-bg)",
              boxShadow: "var(--canvas-shadow-dropdown)",
              backdropFilter: "blur(16px)",
            }}
          >
            <span
              className="flex items-center gap-1"
              data-quick-guide-anchor="video-clip-toolbar"
            >
              <VideoToolbarButton
                label="剪辑"
                icon={<Scissors className="size-3.5" />}
                onClick={() => runAction("clip")}
              />
              <VideoToolbarButton
                label="裁剪"
                icon={<VideoToolbarCropIcon />}
                onClick={() => runAction("crop")}
              />
              <VideoToolbarButton
                label="高清"
                icon={<VideoToolbarHdIcon />}
                onClick={() => runAction("enhance")}
              />
            </span>
            <VideoToolbarButton
              label="解析"
              icon={<VideoToolbarAnalyzeIcon />}
              onClick={() => runAction("seedance-check")}
            />
            <div className="relative inline-flex">
              <VideoToolbarButton
                label="智能去字幕"
                icon={<SubtitleRemoveIcon />}
                menu
                active={videoMenuOpen === "subtitle"}
                onClick={() =>
                  setVideoMenuOpen((current) =>
                    current === "subtitle" ? null : "subtitle",
                  )
                }
              />
              {videoMenuOpen === "subtitle" ? (
                <VideoToolbarMenu
                  items={[
                    { action: "remove-bg", label: "智能去字幕" },
                    { action: "erase", label: "字幕区域擦除" },
                  ]}
                  onAction={runAction}
                />
              ) : null}
            </div>
            <div className="relative inline-flex">
              <VideoToolbarButton
                label="音频分离"
                icon={<AudioSeparateIcon />}
                menu
                active={videoMenuOpen === "audio"}
                onClick={() =>
                  setVideoMenuOpen((current) =>
                    current === "audio" ? null : "audio",
                  )
                }
              />
              {videoMenuOpen === "audio" ? (
                <VideoToolbarAudioSeparationMenu onAction={runAction} />
              ) : null}
            </div>
            <div className="mx-1 h-5 w-0 border-l-[0.5px] border-[var(--canvas-controls-border)]" />
            <VideoToolbarIconButton
              label="下载"
              icon={<VideoToolbarDownloadIcon />}
              authDownloadTrigger
              onClick={() => runAction("download")}
            />
            <VideoToolbarIconButton
              label="查看"
              icon={<VideoToolbarExpandIcon />}
              onClick={() => runAction("fullscreen")}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        placement === "inline"
          ? "node-float-ui nodrag nopan nowheel pointer-events-auto relative z-[80] flex w-max cursor-default items-center whitespace-nowrap"
          : `node-float-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 z-[80] flex origin-bottom cursor-default items-center whitespace-nowrap transition-opacity ${visibility === "hover" ? "opacity-0 group-hover/media:opacity-100 group-focus-within/media:opacity-100" : ""}`
      }
      data-image-editor-toolbar=""
      data-testid="canvas-node-toolbar"
      style={
        placement === "inline"
          ? undefined
          : {
              top: "calc(-52px * var(--workflow-float-scale, 1))",
              transform:
                "translateX(-50%) translateY(-100%) scale(var(--workflow-float-scale, 1))",
              transformOrigin: "center bottom",
            }
      }
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="relative overflow-visible z-[var(--z-panel,80)]">
        <div
          className="box-border flex w-fit items-center justify-center gap-2 rounded-xl p-2 text-[var(--canvas-controls-text,#fff)] backdrop-blur-[16px]"
          style={{
            backgroundColor:
              "var(--canvas-controls-bg, var(--panel-background, #262626))",
            border: "0.5px solid var(--canvas-controls-border, #363636)",
            boxShadow:
              "var(--canvas-shadow-dropdown, 0 4px 10px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.2))",
          }}
        >
          <div
            className="relative"
            data-testid="image-toolbar-portrait-texture-wrap"
          >
            <OrdinaryImageToolbarButton
              label="人像质感调节"
              icon={<ImageToolbarPortraitTextureIcon />}
              testId="image-toolbar-portrait-texture"
              active={portraitTextureOpen}
              text
              menu
              newBadge
              onClick={() => {
                setImagePresetOpen(false);
                setPrimaryToolOpen(false);
                setGridSplitOpen(false);
                setPortraitTextureOpen((open) => !open);
              }}
            />
            {portraitTextureOpen ? (
              <ImageToolbarPortraitTextureMenu onAction={runAction} />
            ) : null}
          </div>
          <OrdinaryImageToolbarButton
            label="全景"
            icon={<ImageToolbarPanoramaSlashIcon />}
            testId="image-toolbar-panorama-slash"
            text
            onClick={() => runAction("panorama")}
          />
          <div
            className="flex items-center gap-2"
            data-quick-guide-anchor="image-edit-toolbar"
          >
            <OrdinaryImageToolbarButton
              label="多角度"
              icon={<ImageToolbarAngleIcon />}
              testId="image-toolbar-angle"
              text
              onClick={() => runAction("rotate")}
            />
            <OrdinaryImageToolbarButton
              label="打光"
              icon={<ImageToolbarLightIcon />}
              testId="image-toolbar-light"
              text
              onClick={() => runAction("clean")}
            />
            <div
              className="bg-border-muted h-5 w-px shrink-0 self-center"
              aria-hidden="true"
            />
            <div
              className="relative"
              data-testid="image-toolbar-nine-grid-wrap"
            >
              <OrdinaryImageToolbarButton
                label="九宫格"
                icon={<NineGridToolbarIcon />}
                testId="image-toolbar-nine-grid"
                quickGuideAnchor="character-grid-button"
                active={imagePresetOpen}
                text
                menu
                onClick={() => {
                  setPortraitTextureOpen(false);
                  setGridSplitOpen(false);
                  setPrimaryToolOpen(false);
                  setImagePresetOpen((open) => !open);
                }}
              />
              {imagePresetOpen ? (
                <ImageToolbarPresetMenu
                  items={WORKFLOW_IMAGE_TOOLBAR_PRESET_OPTIONS}
                  onSelect={runImagePreset}
                />
              ) : null}
            </div>
          </div>
          <div
            className="relative"
            data-testid="image-editor-primary-tool-menu"
          >
            <OrdinaryImageToolbarButton
              label="高清"
              icon={<ImageToolbarHdIcon />}
              testId="image-editor-primary-tool-trigger"
              active={primaryToolOpen}
              text
              menu
              onClick={() => {
                setPortraitTextureOpen(false);
                setImagePresetOpen(false);
                setGridSplitOpen(false);
                setPrimaryToolOpen((open) => !open);
              }}
            />
            {primaryToolOpen ? (
              <ImageToolbarPrimaryToolMenu onAction={runAction} />
            ) : null}
          </div>
          <div className="relative" data-testid="image-toolbar-grid-split-wrap">
            <OrdinaryImageToolbarButton
              label="宫格切分"
              icon={<ImageToolbarGridSplitIcon />}
              testId="image-toolbar-grid-split"
              active={gridSplitOpen}
              text
              menu
              onClick={() => {
                setPortraitTextureOpen(false);
                setImagePresetOpen(false);
                setPrimaryToolOpen(false);
                setGridSplitOpen((open) => !open);
              }}
            />
            {gridSplitOpen ? (
              <ImageToolbarGridSplitMenu onAction={runAction} />
            ) : null}
          </div>
          <div className="bg-canvas-controls-border mx-1 h-8 w-[0.5px]" />
          <OrdinaryImageToolbarButton
            label="标注"
            icon={<ImageToolbarAnnotateIcon />}
            testId="image-toolbar-annotate"
            onClick={() => runAction("annotate")}
          />
          <OrdinaryImageToolbarButton
            label="旋转"
            icon={<ImageToolbarRotateIcon />}
            testId="image-toolbar-rotate"
            onClick={() => runAction("rotate-image")}
          />
          <OrdinaryImageToolbarButton
            label={downloadRunning ? "下载中" : "下载"}
            icon={
              downloadRunning ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ImageToolbarDownloadIcon />
              )
            }
            testId="image-toolbar-download"
            disabled={downloadRunning}
            onClick={runDownloadAction}
          />
          <OrdinaryImageToolbarButton
            label="查看"
            icon={<ImageToolbarPreviewIcon />}
            testId="image-toolbar-preview"
            onClick={() => runAction("fullscreen")}
          />
        </div>
      </div>
    </div>
  );
}

export function NineGridToolbarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 19.8008 19.8008" fill="none">
      <path
        d="M16.9004 0C18.502 0 19.8008 1.29877 19.8008 2.90039V16.9004C19.8008 18.502 18.502 19.8008 16.9004 19.8008H2.90039C1.29877 19.8008 0 18.502 0 16.9004V2.90039C0 1.29876 1.29876 0 2.90039 0H16.9004ZM1.80078 16.9004C1.80078 17.5079 2.29288 18 2.90039 18H6V13.8008H1.80078V16.9004ZM7.80078 18H12V13.8008H7.80078V18ZM13.8008 18H16.9004C17.5079 18 18 17.5079 18 16.9004V13.8008H13.8008V18ZM1.80078 12H6V7.80078H1.80078V12ZM7.80078 12H12V7.80078H7.80078V12ZM13.8008 12H18V7.80078H13.8008V12ZM2.90039 1.80078C2.29288 1.80078 1.80078 2.29288 1.80078 2.90039V6H6V1.80078H2.90039ZM7.80078 6H12V1.80078H7.80078V6ZM13.8008 6H18V2.90039C18 2.29288 17.5079 1.80078 16.9004 1.80078H13.8008V6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarChevronIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className={`pointer-events-none h-3 w-3 shrink-0 opacity-80 ${up ? "rotate-180" : ""}`}
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <g transform="translate(4.3472 5.8234)">
        <path
          d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function ImageToolbarPortraitTextureIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 22 22"
    >
      <path
        d="M11 0C17.075 0.000175947 22 4.92498 22 11C21.9998 17.0749 17.0749 21.9998 11 22C4.92498 22 0.000175952 17.075 0 11C0 4.92487 4.92487 0 11 0ZM11.1025 14.1143C8.56969 14.1143 5.73469 14.978 4.21094 17.209C5.89308 19.0471 8.31209 20.2002 11 20.2002C13.689 20.2001 16.1079 19.0455 17.79 17.2061C16.289 14.967 13.6143 14.1143 11.1025 14.1143ZM11 1.7998C5.91898 1.7998 1.7998 5.91898 1.7998 11C1.79986 12.7171 2.27179 14.3237 3.09082 15.6992C5.12961 13.1621 8.45435 12.3136 11.1025 12.3135C13.7659 12.3135 16.9239 13.17 18.9131 15.6914C19.7294 14.3176 20.2001 12.7139 20.2002 11C20.2002 5.91909 16.0809 1.79998 11 1.7998ZM11 3.48535C13.209 3.48553 15 5.27632 15 7.48535C14.9997 9.69415 13.2088 11.4852 11 11.4854C8.79103 11.4854 7.00027 9.69426 7 7.48535C7 5.27621 8.79086 3.48535 11 3.48535ZM11 5.28516C9.78497 5.28516 8.7998 6.27033 8.7998 7.48535C8.80008 8.70014 9.78514 9.68555 11 9.68555C12.2147 9.68537 13.1999 8.70004 13.2002 7.48535C13.2002 6.27043 12.2149 5.28533 11 5.28516Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarPanoramaSlashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="text-canvas-controls-text h-4 w-4 shrink-0"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
    >
      <path
        fill="currentColor"
        d="M1.48 7.624a.13.13 0 0 1 .198.112.14.14 0 0 1-.045.102c-.299.28-.465.588-.465.912 0 .99 1.543 1.835 3.718 2.174v-.88c0-.192.221-.301.375-.184l1.588 1.222a.35.35 0 0 1-.007.56L5.256 12.8a.233.233 0 0 1-.37-.189v-.565C2.218 11.662.294 10.569.293 9.28c0-.615.438-1.186 1.186-1.656m10.845.112a.13.13 0 0 1 .198-.112c.748.47 1.186 1.041 1.186 1.656 0 1.36-2.14 2.5-5.033 2.824a.2.2 0 0 1-.22-.198v-.716c0-.102.078-.188.18-.2 2.425-.283 4.197-1.179 4.198-2.24 0-.324-.166-.632-.465-.912a.14.14 0 0 1-.044-.102m-1.977-6.355a1.34 1.34 0 0 1 1.254.78q.174.356.174.797v4.294q0 .441-.174.804a1.37 1.37 0 0 1-.496.564 1.35 1.35 0 0 1-.758.21q-.456 0-.779-.21a1.35 1.35 0 0 1-.485-.564 1.9 1.9 0 0 1-.164-.804V2.958q0-.446.169-.803.172-.357.495-.565.323-.21.764-.21M4.622 2.532 3.551 8.75H2.44l1.09-6.229H1.925v-1.06h2.697zm2.073-1.151q.392 0 .665.13.274.128.442.366t.243.575q.08.333.079.744 0 .492-.148 1.062a9 9 0 0 1-.388 1.165q-.238.594-.535 1.175-.298.575-.605 1.09h1.696V8.75H5.238V7.688q.343-.525.664-1.105.323-.58.58-1.166a8 8 0 0 0 .417-1.14q.154-.55.154-1.011 0-.328-.065-.61-.064-.283-.293-.283-.227 0-.292.282a2.7 2.7 0 0 0-.064.61v.506h-1.07v-.505q-.001-.436.073-.784.079-.351.248-.595.169-.247.441-.376.273-.13.664-.13m3.653 1.042a.28.28 0 0 0-.273.168.8.8 0 0 0-.084.367v4.294q0 .213.084.377.084.159.273.16a.29.29 0 0 0 .273-.16.8.8 0 0 0 .084-.377V2.958a.8.8 0 0 0-.084-.377.29.29 0 0 0-.273-.158"
      />
    </svg>
  );
}

export function ImageToolbarAngleIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
      width="1em"
      height="1em"
      viewBox="0 0 21.6006 21.8008"
    >
      <path
        d="M10.9004 0C12.2479 0 13.392 0.77456 14.2607 1.86621C15.0486 2.8563 15.672 4.1803 16.1045 5.69141C16.6345 5.84296 17.138 6.0177 17.6104 6.21289C19.4301 6.96498 20.9374 8.09253 21.5342 9.56152C21.7212 10.022 21.4996 10.5473 21.0391 10.7344C20.5786 10.9214 20.0533 10.6997 19.8662 10.2393C19.536 9.42632 18.5618 8.55336 16.9229 7.87598C15.3185 7.21299 13.2198 6.80078 10.9004 6.80078C9.56763 6.80078 8.30935 6.93585 7.17676 7.17676C6.93585 8.30935 6.80078 9.56763 6.80078 10.9004C6.80078 12.2328 6.93598 13.4907 7.17676 14.623C8.3094 14.864 9.56755 15 10.9004 15C12.6499 15 14.2702 14.7645 15.6475 14.3662L13.7002 13.416C13.2535 13.1982 13.0674 12.6596 13.2852 12.2129C13.503 11.7661 14.0425 11.581 14.4893 11.7988L18.3027 13.6582C18.7495 13.8761 18.9356 14.4155 18.7178 14.8623L16.8574 18.6758C16.6396 19.1224 16.101 19.3084 15.6543 19.0908C15.2075 18.8729 15.0214 18.3335 15.2393 17.8867L16.1074 16.1064C14.5538 16.5512 12.7763 16.8008 10.9004 16.8008C9.80222 16.8008 8.7375 16.7143 7.73145 16.5547C7.86602 16.9159 8.01286 17.2552 8.16992 17.5693C9.02695 19.2832 10.0445 20 10.9004 20C11.119 20 11.3398 19.9565 11.5625 19.8662C12.023 19.6797 12.5476 19.9018 12.7344 20.3623C12.9211 20.8229 12.6989 21.3474 12.2383 21.5342C11.815 21.7058 11.3657 21.8008 10.9004 21.8008C8.99534 21.8008 7.51227 20.2793 6.55957 18.374C6.21973 17.6943 5.92948 16.9318 5.69336 16.1064C4.86847 15.8704 4.10612 15.5809 3.42676 15.2412C1.5215 14.2885 0 12.8054 0 10.9004C0 8.99534 1.5215 7.51227 3.42676 6.55957C4.10619 6.21985 4.86837 5.92944 5.69336 5.69336C5.92944 4.86837 6.21985 4.10619 6.55957 3.42676C7.51227 1.5215 8.99534 0 10.9004 0ZM5.24512 7.73145C4.88418 7.86593 4.54531 8.01298 4.23145 8.16992C2.51763 9.02695 1.80078 10.0445 1.80078 10.9004C1.80078 11.7563 2.51763 12.7738 4.23145 13.6309C4.54522 13.7878 4.8843 13.9339 5.24512 14.0684C5.08559 13.0626 5 11.9982 5 10.9004C5 9.80227 5.0855 8.73746 5.24512 7.73145ZM10.9004 1.80078C10.0445 1.80078 9.02695 2.51763 8.16992 4.23145C8.01298 4.54531 7.86593 4.88418 7.73145 5.24512C8.73746 5.0855 9.80227 5 10.9004 5C11.9977 5 13.0608 5.08515 14.0645 5.24414C13.7217 4.32451 13.3084 3.56012 12.8525 2.9873C12.1821 2.14481 11.5048 1.80078 10.9004 1.80078Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarLightIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <path
        d="M8.00098 11.7334C8.33224 11.7334 8.60139 12.0018 8.60156 12.333V14C8.60156 14.3314 8.33235 14.6006 8.00098 14.6006C7.66961 14.6006 7.40039 14.3314 7.40039 14V12.333C7.40057 12.0018 7.66971 11.7334 8.00098 11.7334ZM3.97656 10.1758C4.21089 9.94156 4.59091 9.9415 4.8252 10.1758C5.05948 10.4101 5.05941 10.7901 4.8252 11.0244L3.8916 11.958C3.65726 12.192 3.27717 12.1922 3.04297 11.958C2.80876 11.7238 2.80898 11.3437 3.04297 11.1094L3.97656 10.1758ZM11.1768 10.1758C11.4111 9.94153 11.7911 9.94153 12.0254 10.1758L12.959 11.1094C13.1929 11.3437 13.1931 11.7238 12.959 11.958C12.7247 12.1923 12.3437 12.1923 12.1094 11.958L11.1768 11.0244C10.9425 10.7901 10.9425 10.4101 11.1768 10.1758ZM10.668 6.39941C10.9992 6.39959 11.2676 6.66874 11.2676 7C11.2676 7.86637 10.9232 8.69695 10.3105 9.30957C9.69793 9.92219 8.86735 10.2666 8.00098 10.2666C7.1346 10.2666 6.30403 9.92219 5.69141 9.30957C5.07879 8.69695 4.73438 7.86637 4.73438 7C4.73438 6.66874 5.00276 6.39959 5.33398 6.39941C5.66536 6.39941 5.93457 6.66863 5.93457 7C5.93457 7.54811 6.15149 8.07434 6.53906 8.46191C6.92664 8.84949 7.45286 9.06641 8.00098 9.06641C8.54909 9.06641 9.07532 8.84949 9.46289 8.46191C9.85047 8.07434 10.0674 7.54811 10.0674 7C10.0674 6.66863 10.3366 6.39941 10.668 6.39941ZM2.66797 6.39941C2.99919 6.39959 3.26758 6.66874 3.26758 7C3.26758 7.33126 2.99919 7.60041 2.66797 7.60059H1.33398C1.00276 7.60041 0.734375 7.33126 0.734375 7C0.734375 6.66874 1.00276 6.39959 1.33398 6.39941H2.66797ZM14.668 6.39941C14.9992 6.39959 15.2676 6.66874 15.2676 7C15.2676 7.33126 14.9992 7.60041 14.668 7.60059H13.334C13.0028 7.60041 12.7344 7.33126 12.7344 7C12.7344 6.66874 13.0028 6.39959 13.334 6.39941H14.668ZM14.668 3.7334C14.9991 3.73357 15.2674 4.00189 15.2676 4.33301C15.2676 4.66427 14.9992 4.93342 14.668 4.93359H1.33398C1.00276 4.93342 0.734375 4.66427 0.734375 4.33301C0.734551 4.0019 1.00287 3.73357 1.33398 3.7334H14.668ZM12.001 1.39941C12.3323 1.39941 12.6016 1.66863 12.6016 2C12.6016 2.33137 12.3323 2.60059 12.001 2.60059H4.00098C3.66961 2.60059 3.40039 2.33137 3.40039 2C3.40039 1.66863 3.66961 1.39941 4.00098 1.39941H12.001Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarHdIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
    >
      <path
        d="M16.7529 0C18.5461 0 20 1.45394 20 3.24707V16.7529C20 18.5461 18.5461 20 16.7529 20H3.24707L3.08008 19.9961C1.3644 19.9093 0 18.4902 0 16.7529V3.24707C0 1.50983 1.3644 0.0906556 3.08008 0.00390625L3.24707 0H16.7529ZM3.24707 1.5C2.28236 1.5 1.5 2.28237 1.5 3.24707V16.7529C1.5 17.7176 2.28237 18.5 3.24707 18.5H16.7529C17.7176 18.5 18.5 17.7176 18.5 16.7529V3.24707C18.5 2.28236 17.7176 1.5 16.7529 1.5H3.24707ZM5.12109 9.25H7.91797V6.0752H9.41797V14.0752H7.91797V10.75H5.12109V14.0752H3.62109V6.0752H5.12109V9.25ZM13.2764 6.08008C14.7763 6.13536 17.0439 6.68501 17.0439 10.124C17.0438 13.5634 14.7109 14.0269 13.2637 14.0713L12.9873 14.0752H10.9941V6.0752H12.9873L13.2764 6.08008ZM12.4941 12.5752H12.9873C13.637 12.5752 14.2822 12.4963 14.7412 12.207C15.0683 12.0007 15.5439 11.5403 15.5439 10.124C15.5439 8.68966 15.0717 8.19497 14.7373 7.97168C14.2874 7.67149 13.6456 7.57521 12.9873 7.5752H12.4941V12.5752Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarExpandIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
    >
      <path
        d="M16.9004 2C18.0602 2.00018 19 2.94014 19 4.09961V10.4502C19 10.8643 18.6642 11.2002 18.25 11.2002C17.8358 11.2002 17.5 10.8643 17.5 10.4502V4.09961C17.5 3.76862 17.2314 3.50018 16.9004 3.5H3.09961C2.76858 3.5 2.50018 3.76858 2.5 4.09961V15.9004C2.50018 16.2314 2.76862 16.5 3.09961 16.5H9.4502C9.86428 16.5 10.2002 16.8358 10.2002 17.25C10.2002 17.6642 9.86428 18 9.4502 18H3.09961C1.94014 17.9998 1.00018 17.0602 1 15.9004V4.09961C1.00018 2.94 1.94 2 3.09961 2H16.9004ZM15.3496 11C16.8132 11.0002 17.9998 12.1868 18 13.6504V16.3496C17.9998 17.8132 16.8132 18.9998 15.3496 19H12.6504C11.1868 18.9998 10.0002 17.8132 10 16.3496V13.6504C10.0002 12.1868 11.1868 11.0002 12.6504 11H15.3496ZM12.6504 12.5C12.0152 12.5002 11.5002 13.0152 11.5 13.6504V16.3496C11.5002 16.9848 12.0152 17.4998 12.6504 17.5H15.3496C15.9848 17.4998 16.4998 16.9848 16.5 16.3496V13.6504C16.4998 13.0152 15.9848 12.5002 15.3496 12.5H12.6504ZM7.30859 5.51562C7.72267 5.51562 8.05859 5.85155 8.05859 6.26562C8.05859 6.6797 7.72267 7.01562 7.30859 7.01562H6.71191L9.53027 9.83398C9.82316 10.1269 9.82316 10.6017 9.53027 10.8945C9.23738 11.1874 8.76262 11.1874 8.46973 10.8945L5.65039 8.0752V8.67285C5.65039 9.08693 5.31447 9.42285 4.90039 9.42285C4.48632 9.42285 4.15039 9.08693 4.15039 8.67285V6.26562C4.15039 5.85155 4.48632 5.51562 4.90039 5.51562H7.30859Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarRepaintIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
    >
      <path
        d="M14.7861 2.70996C15.4501 2.7101 16.0872 2.97481 16.5566 3.44434C17.0259 3.91388 17.2901 4.551 17.29 5.21484C17.2898 5.83713 17.0573 6.43545 16.6416 6.89453L16.5557 6.98438L15.1631 8.37793C15.1461 8.40023 15.1277 8.422 15.1074 8.44238C15.087 8.46277 15.0643 8.48107 15.042 8.49805L14.2109 9.3291L16.6396 11.7578C17.51 12.6284 17.5101 14.0367 16.6396 14.9072L14.9072 16.6396C14.0367 17.5101 12.6284 17.51 11.7578 16.6396L9.3291 14.2119L7.66016 15.8818C7.43325 16.108 7.15415 16.2749 6.84766 16.3682L3.94629 17.248H3.94531C3.7797 17.2978 3.60326 17.3019 3.43555 17.2598C3.26785 17.2176 3.11458 17.1309 2.99219 17.0088C2.86978 16.8866 2.78268 16.7331 2.74023 16.5654C2.69791 16.398 2.70158 16.2222 2.75098 16.0566V16.0537L3.63184 13.1533L3.63281 13.1514C3.72693 12.8447 3.89494 12.5653 4.12207 12.3389L5.78906 10.6719L3.35938 8.24219C2.94332 7.82411 2.70999 7.25779 2.70996 6.66797C2.70997 6.07812 2.9433 5.51184 3.35938 5.09375L5.09375 3.35938C5.51184 2.9433 6.07812 2.70997 6.66797 2.70996C7.22077 2.70999 7.75238 2.91491 8.16113 3.2832L8.24219 3.35938L10.6709 5.78809L11.502 4.95703C11.5189 4.93484 11.5373 4.91285 11.5576 4.89258C11.5777 4.87255 11.5992 4.85463 11.6211 4.83789L13.0156 3.44336C13.4851 2.97409 14.1223 2.70993 14.7861 2.70996ZM5.00488 13.2236V13.2246C4.92332 13.3059 4.86229 13.4057 4.82812 13.5156V13.5166L4.10645 15.8936L6.48438 15.1719C6.59497 15.1382 6.69543 15.0777 6.77734 14.9961L13.7764 7.99609L12.0039 6.22363L5.00488 13.2236ZM14.7861 3.95996C14.4538 3.95993 14.1345 4.0922 13.8994 4.32715L12.8877 5.33887L14.6602 7.1123L15.6719 6.10059L15.7559 6.00879C15.9385 5.78592 16.0399 5.50548 16.04 5.21484C16.0401 4.88258 15.9076 4.56321 15.6729 4.32812C15.4378 4.09305 15.1185 3.96006 14.7861 3.95996Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarEraseIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
    >
      <path
        d="M11.5283 2.5C12.0984 2.50009 12.6459 2.72703 13.0498 3.13086L17.6338 7.71484C18.4742 8.55548 18.4742 9.91783 17.6338 10.7588L12.1416 16.25H16.875C17.2202 16.25 17.5 16.5298 17.5 16.875C17.5 17.2202 17.2202 17.5 16.875 17.5H6.94434C6.37341 17.4999 5.82543 17.273 5.42188 16.8682L2.36621 13.8135C1.52571 12.9726 1.52608 11.6105 2.36621 10.7695L10.0068 3.13086C10.4107 2.72687 10.958 2.5 11.5283 2.5ZM4.71387 10.1885L3.25098 11.6533C2.89867 12.0059 2.89872 12.5772 3.25098 12.9297L6.30273 15.9854C6.47287 16.1557 6.70333 16.25 6.94434 16.25H10.3809L10.5791 16.0518L4.71387 10.1885ZM11.5283 3.75C11.2887 3.75003 11.0588 3.8453 10.8896 4.01465L5.59766 9.30469L11.4619 15.168L16.749 9.875C17.1017 9.52218 17.1016 8.95117 16.749 8.59863L12.167 4.01465C11.9977 3.84533 11.768 3.75005 11.5283 3.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarCutoutIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
    >
      <path
        d="M16.2275 2.88867C16.4716 2.64459 16.8673 2.64459 17.1113 2.88867C17.3554 3.13275 17.3554 3.52838 17.1113 3.77246L3.77637 17.1064C3.53229 17.3505 3.13666 17.3505 2.89258 17.1064C2.64866 16.8624 2.64866 16.4667 2.89258 16.2227L16.2275 2.88867ZM16.2275 7.88867C16.4716 7.64459 16.8673 7.64459 17.1113 7.88867C17.3554 8.13275 17.3554 8.52838 17.1113 8.77246L8.77637 17.1064C8.53229 17.3505 8.13666 17.3505 7.89258 17.1064C7.64866 16.8624 7.64866 16.4667 7.89258 16.2227L16.2275 7.88867ZM16.2275 12.8887C16.4716 12.6446 16.8673 12.6446 17.1113 12.8887C17.3554 13.1328 17.3554 13.5284 17.1113 13.7725L13.7764 17.1064C13.5323 17.3505 13.1367 17.3505 12.8926 17.1064C12.6487 16.8624 12.6487 16.4667 12.8926 16.2227L16.2275 12.8887ZM11.2275 2.88867C11.4716 2.64459 11.8673 2.64459 12.1113 2.88867C12.3554 3.13275 12.3554 3.52838 12.1113 3.77246L3.77637 12.1064C3.53229 12.3505 3.13666 12.3505 2.89258 12.1064C2.64866 11.8624 2.64866 11.4667 2.89258 11.2227L11.2275 2.88867ZM6.22754 2.88867C6.47162 2.64459 6.86725 2.64459 7.11133 2.88867C7.35541 3.13275 7.35541 3.52838 7.11133 3.77246L3.77637 7.10645C3.53229 7.35053 3.13666 7.35053 2.89258 7.10645C2.64866 6.86243 2.64866 6.46674 2.89258 6.22266L6.22754 2.88867Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarCropIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
    >
      <path
        d="M5.5 1.875C5.84514 1.87504 6.125 2.15485 6.125 2.5V4.875H13C13.5636 4.87502 14.1044 5.09857 14.5029 5.49707C14.9014 5.89557 15.125 6.43644 15.125 7V13.875H17.5C17.8451 13.875 18.125 14.1549 18.125 14.5C18.125 14.8451 17.8451 15.125 17.5 15.125H15.125V17.5C15.125 17.8451 14.8451 18.125 14.5 18.125C14.1549 18.125 13.875 17.8451 13.875 17.5V15.125H7C6.43644 15.125 5.89557 14.9014 5.49707 14.5029C5.09857 14.1044 4.87502 13.5636 4.875 13V6.125H2.5C2.15485 6.125 1.87504 5.84514 1.875 5.5C1.87504 5.15486 2.15485 4.875 2.5 4.875H4.875V2.5C4.875 2.15485 5.15486 1.87504 5.5 1.875ZM6.125 13C6.12502 13.232 6.21776 13.4541 6.38184 13.6182C6.54591 13.7822 6.76797 13.875 7 13.875H13.875V7C13.875 6.76797 13.7822 6.54591 13.6182 6.38184C13.4541 6.21776 13.232 6.12502 13 6.125H6.125V13Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarGridSplitIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <path
        d="M4.75586 2C4.97659 2.00021 5.15527 2.17961 5.15527 2.40039V4.11523H10.8711V2.40039C10.8711 2.17948 11.0506 2 11.2715 2H11.5107C11.7317 2 11.9111 2.17948 11.9111 2.40039V4.11523H13.5996C13.8205 4.11523 14 4.29471 14 4.51562V4.75586C13.9998 4.97659 13.8204 5.15527 13.5996 5.15527H11.9111V10.8711H13.5996C13.8205 10.8711 14 11.0506 14 11.2715V11.5107C14 11.7317 13.8205 11.9111 13.5996 11.9111H11.9111V13.5996C11.9111 13.8205 11.7317 14 11.5107 14H11.2715C11.0506 14 10.8711 13.8205 10.8711 13.5996V11.9111H5.15527V13.5996C5.15527 13.8204 4.97659 13.9998 4.75586 14H4.51562C4.29471 14 4.11523 13.8205 4.11523 13.5996V11.9111H2.40039C2.17948 11.9111 2 11.7317 2 11.5107V11.2715C2 11.0506 2.17948 10.8711 2.40039 10.8711H4.11523V5.15527H2.40039C2.17961 5.15527 2.00021 4.97659 2 4.75586V4.51562C2 4.29471 2.17948 4.11523 2.40039 4.11523H4.11523V2.40039C4.11523 2.17948 4.29471 2 4.51562 2H4.75586ZM5.15527 10.8711H10.8711V5.15527H5.15527V10.8711Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarAnnotateIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
      width="1.17em"
      height="1em"
      viewBox="0 0 22.3835 19.1335"
    >
      <path
        d="M12.1807 0.26336C12.532 -0.0878492 13.1017 -0.0877239 13.4531 0.26336C13.8044 0.614848 13.8045 1.18539 13.4531 1.5368L8.47656 6.51336L8.39453 6.60613C8.21431 6.83017 8.11426 7.11009 8.11426 7.40008C8.11437 7.73148 8.24457 8.05012 8.47656 8.2868L14.0967 13.9069C14.3334 14.1388 14.6521 14.2691 14.9834 14.2692C15.3149 14.2692 15.6334 14.1389 15.8701 13.9069L20.8477 8.93035C21.1991 8.57903 21.7687 8.57894 22.1201 8.93035C22.4713 9.28179 22.4714 9.8514 22.1201 10.2028L17.1367 15.1862L17.1309 15.193C16.5576 15.7548 15.786 16.069 14.9834 16.069C14.7141 16.069 14.4492 16.0309 14.1934 15.9626L11.2871 18.8698C11.1183 19.0385 10.889 19.1335 10.6504 19.1335H0.900391C0.403471 19.1335 0.000222034 18.73 0 18.2331V14.9831C8.62068e-05 14.7448 0.0952972 14.516 0.263672 14.3473L6.41992 8.19012C6.35171 7.93449 6.31449 7.66913 6.31445 7.40008C6.31445 6.59747 6.62964 5.82682 7.19141 5.25359L7.19727 5.24676L12.1807 0.26336ZM1.80078 15.3561V17.3337H10.2773L12.627 14.9831L7.40039 9.75555L1.80078 15.3561Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarRotateIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <path
        d="M8.60059 14.6699H7.39941V12.0029H8.60059V14.6699ZM6.84082 5.00977L5.62402 7.3877L4.55469 6.83984L4.84668 6.26758C4.35115 6.38 3.90104 6.51695 3.50879 6.67383C2.94768 6.89829 2.53339 7.15095 2.26953 7.40039C2.00692 7.64874 1.93359 7.85288 1.93359 8.00293C1.93359 8.15298 2.00692 8.35712 2.26953 8.60547C2.53339 8.85491 2.94768 9.10757 3.50879 9.33203C4.6282 9.77972 6.21604 10.0693 8 10.0693C9.78395 10.0693 11.3718 9.77971 12.4912 9.33203C13.0523 9.10757 13.4666 8.85491 13.7305 8.60547C13.9931 8.35712 14.0664 8.15298 14.0664 8.00293C14.0664 7.85288 13.9931 7.64874 13.7305 7.40039C13.4666 7.15095 13.0523 6.89829 12.4912 6.67383C11.6598 6.34133 10.5696 6.09645 9.33301 5.99219V4.78809C10.7076 4.89567 11.9529 5.16714 12.9365 5.56055C13.5816 5.81857 14.1448 6.14078 14.5557 6.5293C14.9675 6.91895 15.2666 7.41683 15.2666 8.00293C15.2666 8.58903 14.9675 9.08691 14.5557 9.47656C14.1448 9.86508 13.5816 10.1873 12.9365 10.4453C11.6431 10.9626 9.89764 11.2695 8 11.2695C6.10236 11.2695 4.35689 10.9626 3.06348 10.4453C2.41843 10.1873 1.85516 9.86508 1.44434 9.47656C1.03249 9.08691 0.733399 8.58903 0.733398 8.00293C0.733398 7.41683 1.03249 6.91895 1.44434 6.5293C1.85516 6.14078 2.41843 5.81857 3.06348 5.56055C3.56192 5.36119 4.12758 5.19377 4.74316 5.0625L4.1582 4.67578L4.81934 3.67383L6.84082 5.00977ZM8.60059 9.33594H7.39941V1.33594H8.60059V9.33594Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarDownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
      width="1em"
      height="1em"
      viewBox="0 0 19.8008 19.9004"
    >
      <path
        d="M1.80078 17C1.80078 17.2917 1.91676 17.5711 2.12305 17.7773C2.32934 17.9836 2.60865 18.0996 2.90039 18.0996H16.9004C17.1921 18.0996 17.4714 17.9836 17.6777 17.7773C17.884 17.5711 18 17.2917 18 17V13H19.8008V17C19.8008 17.7691 19.495 18.5069 18.9512 19.0508C18.4073 19.5946 17.6695 19.9004 16.9004 19.9004H2.90039C2.13126 19.9004 1.39346 19.5946 0.849609 19.0508C0.305754 18.5069 0 17.7691 0 17V13H1.80078V17ZM10.8008 11.8262L14.2637 8.36328L15.5371 9.63672L10.5371 14.6367C10.1856 14.9882 9.61514 14.9882 9.26367 14.6367L4.26367 9.63672L5.53711 8.36328L9 11.8262V0H10.8008V11.8262Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarPreviewIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
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

export function StoryboardToolbarLayoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20.7998 20.7998"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <path
        d="M7.2002 10.8994C8.69112 10.8996 9.89931 12.1087 9.89941 13.5996V18.0996C9.89941 19.5906 8.69119 20.7996 7.2002 20.7998H2.7002C1.20902 20.7998 0 19.5908 0 18.0996V13.5996C0.00010566 12.1085 1.20909 10.8994 2.7002 10.8994H7.2002ZM18.0996 10.8994C19.5907 10.8994 20.7997 12.1085 20.7998 13.5996V18.0996C20.7998 19.5908 19.5908 20.7998 18.0996 20.7998H13.5996C12.1085 20.7997 10.8994 19.5907 10.8994 18.0996V13.5996C10.8995 12.1086 12.1086 10.8995 13.5996 10.8994H18.0996ZM2.60742 12.7041C2.15381 12.7503 1.7999 13.1338 1.7998 13.5996V18.0996C1.7998 18.5655 2.15377 18.9489 2.60742 18.9951L2.7002 19H7.2002L7.29199 18.9951C7.74574 18.9489 8.09961 18.5655 8.09961 18.0996V13.5996C8.09951 13.1338 7.7457 12.7502 7.29199 12.7041L7.2002 12.7002H2.7002L2.60742 12.7041ZM13.5078 12.7041C13.054 12.7502 12.7003 13.1337 12.7002 13.5996V18.0996L12.7041 18.1914C12.7469 18.6152 13.0841 18.9521 13.5078 18.9951L13.5996 19H18.0996L18.1914 18.9951C18.6153 18.9523 18.9523 18.6153 18.9951 18.1914L19 18.0996V13.5996C18.9999 13.1336 18.6454 12.75 18.1914 12.7041L18.0996 12.7002H13.5996L13.5078 12.7041ZM18.0996 0C19.5908 0 20.7998 1.20902 20.7998 2.7002V7.2002C20.7996 8.69119 19.5906 9.89941 18.0996 9.89941H2.7002C1.20916 9.89941 0.000211051 8.69118 0 7.2002V2.7002C0 1.20903 1.20903 0 2.7002 0H18.0996ZM2.60742 1.80469C2.15378 1.85095 1.7998 2.23434 1.7998 2.7002V7.2002L1.80469 7.29199C1.84777 7.71534 2.1841 8.05154 2.60742 8.09473L2.7002 8.09961H18.0996C18.5655 8.09961 18.9489 7.74574 18.9951 7.29199L19 7.2002V2.7002C19 2.20314 18.5967 1.7998 18.0996 1.7998H2.7002L2.60742 1.80469Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StoryboardToolbarPlayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <g transform="translate(1.5025 0) scale(0.833229)">
        <path
          d="M0 2.40402C3.05293e-05 0.487271 2.13655 -0.656053 3.73145 0.406947L14.5273 7.60421C15.9521 8.55425 15.9522 10.6484 14.5273 11.5984L3.73145 18.7956C2.13671 19.8583 0.000385754 18.7149 0 16.7985V2.40402ZM2.7334 1.90499C2.33468 1.63918 1.80081 1.92482 1.80078 2.40402V16.7985C1.80117 17.2774 2.33483 17.563 2.7334 17.2976L13.5293 10.1003C13.8851 9.86284 13.885 9.33984 13.5293 9.10226L2.7334 1.90499Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function StoryboardToolbarUngroupIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <path
        d="M1.5 19C2.32843 19 3 19.6716 3 20.5C3 21.3284 2.32843 22 1.5 22C0.671573 22 0 21.3284 0 20.5C0 19.6716 0.671573 19 1.5 19ZM20.5 19C21.3284 19 22 19.6716 22 20.5C22 21.3284 21.3284 22 20.5 22C19.6716 22 19 21.3284 19 20.5C19 19.6716 19.6716 19 20.5 19ZM6 21H4V20H6V21ZM10 21H8V20H10V21ZM14 21H12V20H14V21ZM18 21H16V20H18V21ZM2 18H1V16H2V18ZM21 18H20V16H21V18ZM12 5.25C12.9665 5.25 13.75 6.0335 13.75 7V10C13.75 10.085 13.7422 10.1683 13.7305 10.25H15C15.9665 10.25 16.75 11.0335 16.75 12V15C16.75 15.9665 15.9665 16.75 15 16.75H10C9.0335 16.75 8.25 15.9665 8.25 15V12C8.25 11.915 8.25783 11.8317 8.26953 11.75H7C6.0335 11.75 5.25 10.9665 5.25 10V7C5.25 6.0335 6.0335 5.25 7 5.25H12ZM10 11.75C9.86193 11.75 9.75 11.8619 9.75 12V15C9.75 15.1381 9.86193 15.25 10 15.25H15C15.1381 15.25 15.25 15.1381 15.25 15V12C15.25 11.8619 15.1381 11.75 15 11.75H10ZM2 14H1V12H2V14ZM21 14H20V12H21V14ZM7 6.75C6.86193 6.75 6.75 6.86193 6.75 7V10C6.75 10.1381 6.86193 10.25 7 10.25H12C12.1381 10.25 12.25 10.1381 12.25 10V7C12.25 6.86193 12.1381 6.75 12 6.75H7ZM2 10H1V8H2V10ZM21 10H20V8H21V10ZM2 6H1V4H2V6ZM21 6H20V4H21V6ZM1.5 0C2.32843 0 3 0.671573 3 1.5C3 2.32843 2.32843 3 1.5 3C0.671573 3 0 2.32843 0 1.5C0 0.671573 0.671573 0 1.5 0ZM20.5 0C21.3284 0 22 0.671573 22 1.5C22 2.32843 21.3284 3 20.5 3C19.6716 3 19 2.32843 19 1.5C19 0.671573 19.6716 0 20.5 0ZM6 2H4V1H6V2ZM10 2H8V1H10V2ZM14 2H12V1H14V2ZM18 2H16V1H18V2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StoryboardToolbarDownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <path
        d="M13.7803 4.66699C14.6379 4.66717 15.3328 5.3621 15.333 6.21973V13.7803C15.3328 14.6379 14.6379 15.3328 13.7803 15.333H6.21973L6.06152 15.3252C5.27833 15.2457 4.66716 14.5844 4.66699 13.7803V6.21973C4.66716 5.4156 5.27833 4.75432 6.06152 4.6748L6.21973 4.66699H13.7803ZM6.21973 5.86621C6.02484 5.86639 5.86639 6.02484 5.86621 6.21973V13.7803C5.86639 13.9752 6.02484 14.1336 6.21973 14.1338H13.7803C13.9752 14.1336 14.1336 13.9752 14.1338 13.7803V6.21973C14.1336 6.02484 13.9752 5.86639 13.7803 5.86621H6.21973ZM10.6006 10.5068L11.5674 9.50098L12.4326 10.3311L10.4326 12.415C10.3195 12.5327 10.1632 12.5996 10 12.5996C9.83678 12.5996 9.6805 12.5327 9.56738 12.415L7.56738 10.3311L8.43262 9.50098L9.39941 10.5068V7.33301H10.6006V10.5068ZM10 0.732422C11.0677 0.732422 11.9336 1.59827 11.9336 2.66602V3.20703C11.9336 3.5384 11.6644 3.80762 11.333 3.80762C11.0018 3.80744 10.7334 3.53829 10.7334 3.20703V2.66602C10.7334 2.26101 10.405 1.93262 10 1.93262H2.66699C2.26198 1.93262 1.93359 2.26101 1.93359 2.66602V9.99902C1.93359 10.404 2.26199 10.7324 2.66699 10.7324H3.20801C3.53938 10.7324 3.80859 11.0016 3.80859 11.333C3.80842 11.6642 3.53927 11.9326 3.20801 11.9326H2.66699C1.59925 11.9326 0.7334 11.0668 0.733398 9.99902V2.66602C0.733398 1.59827 1.59924 0.732422 2.66699 0.732422H10Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StoryboardLayoutGridMenuIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 19.8008 19.8008"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <path
        d="M6.90039 11C7.94973 11 8.80078 11.851 8.80078 12.9004V17.9004C8.80078 18.9497 7.94973 19.8008 6.90039 19.8008H1.90039C0.85105 19.8008 0 18.9497 0 17.9004V12.9004C0 11.851 0.85105 11 1.90039 11H6.90039ZM17.9004 11C18.9497 11 19.8008 11.851 19.8008 12.9004V17.9004C19.8008 18.9497 18.9497 19.8008 17.9004 19.8008H12.9004C11.851 19.8008 11 18.9497 11 17.9004V12.9004C11 11.851 11.851 11 12.9004 11H17.9004ZM1.90039 12.8008C1.84516 12.8008 1.80078 12.8452 1.80078 12.9004V17.9004C1.80078 17.9556 1.84516 18 1.90039 18H6.90039C6.95562 18 7 17.9556 7 17.9004V12.9004C7 12.8452 6.95562 12.8008 6.90039 12.8008H1.90039ZM12.9004 12.8008C12.8452 12.8008 12.8008 12.8452 12.8008 12.9004V17.9004C12.8008 17.9556 12.8452 18 12.9004 18H17.9004C17.9556 18 18 17.9556 18 17.9004V12.9004C18 12.8452 17.9556 12.8008 17.9004 12.8008H12.9004ZM6.90039 0C7.94973 0 8.80078 0.85105 8.80078 1.90039V6.90039C8.80078 7.94973 7.94973 8.80078 6.90039 8.80078H1.90039C0.85105 8.80078 0 7.94973 0 6.90039V1.90039C0 0.85105 0.85105 0 1.90039 0H6.90039ZM17.9004 0C18.9497 0 19.8008 0.85105 19.8008 1.90039V6.90039C19.8008 7.94973 18.9497 8.80078 17.9004 8.80078H12.9004C11.851 8.80078 11 7.94973 11 6.90039V1.90039C11 0.85105 11.851 0 12.9004 0H17.9004ZM1.90039 1.80078C1.84516 1.80078 1.80078 1.84516 1.80078 1.90039V6.90039C1.80078 6.95562 1.84516 7 1.90039 7H6.90039C6.95562 7 7 6.95562 7 6.90039V1.90039C7 1.84516 6.95562 1.80078 6.90039 1.80078H1.90039ZM12.9004 1.80078C12.8452 1.80078 12.8008 1.84516 12.8008 1.90039V6.90039C12.8008 6.95562 12.8452 7 12.9004 7H17.9004C17.9556 7 18 6.95562 18 6.90039V1.90039C18 1.84516 17.9556 1.80078 17.9004 1.80078H12.9004Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StoryboardLayoutHorizontalMenuIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16.608 16.3595"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <path
        d="M8.97168 0.753048C9.51639 -0.0471959 10.6149 -0.241498 11.4004 0.324337L15.8936 3.56262C16.6325 4.0952 16.8279 5.11208 16.3398 5.88098L13.3477 10.587C13.3157 10.6372 13.2754 10.6797 13.2334 10.7179L15.3779 15.4308C15.5752 15.8654 15.2575 16.359 14.7803 16.3595H5.67285C5.45203 16.3595 5.24567 16.2472 5.12598 16.0616C5.00644 15.8759 4.98977 15.6417 5.08105 15.4405L5.97754 13.464C5.58917 13.5666 5.18294 13.6251 4.76465 13.6251C2.13096 13.6249 0.00051049 11.5028 0 8.87219C0.000127789 6.2412 2.13073 4.11846 4.76465 4.11828C5.37017 4.1183 5.94983 4.23135 6.4834 4.43762C6.50048 4.39532 6.52311 4.35382 6.5498 4.31457L8.97168 0.753048ZM6.68164 15.0597H13.7803L10.2266 7.25012L6.68164 15.0597ZM4.76465 5.41906C2.84525 5.41924 1.30091 6.96262 1.30078 8.87219C1.30129 10.7814 2.84549 12.3242 4.76465 12.3243C5.51169 12.3243 6.21348 12.0833 6.79102 11.6739L8.21387 8.54016C8.21303 8.53401 8.21059 8.52782 8.20996 8.5216C8.03501 6.77824 6.55613 5.41913 4.76465 5.41906ZM10.6406 1.37902C10.4488 1.24088 10.1801 1.28931 10.0469 1.48449L7.625 5.04602C7.62124 5.05154 7.61528 5.05629 7.61133 5.06164C8.20522 5.50432 8.69197 6.08211 9.02637 6.75012L9.63477 5.41125L9.67969 5.32824C9.79804 5.14426 10.0036 5.02951 10.2266 5.02942C10.481 5.02965 10.7128 5.17871 10.8184 5.41027L12.6035 9.3341L15.2422 5.18371C15.3611 4.99596 15.314 4.74742 15.1338 4.61731L10.6406 1.37902Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StoryboardLayoutVerticalMenuIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <g transform="translate(0 2.446) scale(0.828144)">
        <path
          d="M0.80957 11.8135C1.2513 11.8135 1.60922 12.1716 1.60938 12.6133C1.60934 13.0551 1.25138 13.4131 0.80957 13.4131H0.799805C0.358011 13.4131 3.29641e-05 13.0551 0 12.6133C0.000154534 12.1716 0.358086 11.8135 0.799805 11.8135H0.80957ZM18.5205 11.8135C18.9622 11.8135 19.3202 12.1716 19.3203 12.6133C19.3203 13.0551 18.9623 13.4131 18.5205 13.4131H5.72266C5.28086 13.4131 4.92191 13.0551 4.92188 12.6133C4.92203 12.1716 5.28094 11.8135 5.72266 11.8135H18.5205ZM0.80957 5.90625C1.2514 5.90625 1.60938 6.2652 1.60938 6.70703C1.60916 7.14867 1.25126 7.50684 0.80957 7.50684H0.799805C0.358126 7.50682 0.000219535 7.14866 0 6.70703C0 6.26521 0.357991 5.90627 0.799805 5.90625H0.80957ZM18.5205 5.90625C18.9623 5.90628 19.3203 6.26522 19.3203 6.70703C19.3201 7.14865 18.9622 7.5068 18.5205 7.50684H5.72266C5.28098 7.50682 4.92209 7.14866 4.92188 6.70703C4.92188 6.26521 5.28084 5.90627 5.72266 5.90625H18.5205ZM0.80957 0C1.2514 0 1.60938 0.357977 1.60938 0.799805C1.60934 1.2416 1.25138 1.59961 0.80957 1.59961H0.799805C0.358011 1.59959 3.29641e-05 1.24159 0 0.799805C0 0.357987 0.357991 1.64847e-05 0.799805 0H0.80957ZM18.5205 0C18.9623 3.27342e-05 19.3203 0.357997 19.3203 0.799805C19.3203 1.24158 18.9623 1.59958 18.5205 1.59961H5.72266C5.28086 1.59959 4.92191 1.24159 4.92188 0.799805C4.92188 0.357987 5.28084 1.64847e-05 5.72266 0H18.5205Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function StoryboardRunGroupHandCue() {
  return (
    <svg
      data-testid="run-group-hand-cue"
      aria-hidden="true"
      className="pointer-events-none absolute -right-2 top-3 h-8 w-8 overflow-visible"
      viewBox="0 0 19.2 19.2"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: "drop-shadow(0 1.6px 1.6px rgba(0, 0, 0, 0.42))",
        animation: "scriptv2-run-group-hand-cue 1.6s ease-in-out infinite",
      }}
    >
      <path
        d="M16.7467 9.42909C16.7467 10.9446 16.1475 12.398 15.0809 13.4696C14.0143 14.5412 12.5676 15.1433 11.0592 15.1433H9.63746C7.64686 15.1433 6.43828 14.529 5.379 13.4719L2.81966 10.9005C2.57505 10.6283 2.444 10.2721 2.45362 9.90547C2.46324 9.53889 2.61281 9.19006 2.87136 8.93121C3.1299 8.67237 3.47762 8.52333 3.84252 8.51496C4.20742 8.50659 4.56155 8.63953 4.83158 8.88624L5.37182 9.42909V2.28636C5.37182 1.90748 5.52162 1.54413 5.78827 1.27622C6.05492 1.00832 6.41657 0.857813 6.79367 0.857813C7.17077 0.857813 7.53243 1.00832 7.79908 1.27622C8.06573 1.54413 8.21553 1.90748 8.21553 2.28636V5.85773C8.21553 5.47885 8.36533 5.11549 8.63198 4.84759C8.89863 4.57969 9.26028 4.42918 9.63738 4.42918C10.0145 4.42918 10.3761 4.57969 10.6428 4.84759C10.9094 5.11549 11.0592 5.47885 11.0592 5.85773V6.572C11.0592 6.19312 11.209 5.82977 11.4757 5.56186C11.7423 5.29396 12.104 5.14345 12.4811 5.14345C12.8582 5.14345 13.2198 5.29396 13.4865 5.56186C13.7531 5.82977 13.903 6.19312 13.903 6.572V7.28627C13.903 6.9074 14.0528 6.54404 14.3195 6.27614C14.5861 6.00823 14.9478 5.85773 15.3249 5.85773C15.702 5.85773 16.0636 6.00823 16.3303 6.27614C16.5969 6.54404 16.7467 6.9074 16.7467 7.28627L16.7467 9.42909Z"
        fill="#F7F7F7"
      />
      <path
        d="M10.7184 6.57328V5.85845C10.7183 5.5706 10.6044 5.29442 10.4018 5.09088C10.2246 4.91299 9.9924 4.80341 9.74531 4.77866L9.63784 4.77281C9.35134 4.77288 9.07646 4.88734 8.87387 5.09088C8.67128 5.29442 8.55736 5.5706 8.55728 5.85845V6.57328C8.55713 6.76241 8.40478 6.91547 8.21654 6.91563C8.02817 6.91563 7.87511 6.7625 7.87496 6.57328V2.28764C7.87496 1.99976 7.76094 1.72367 7.55838 1.52007C7.35572 1.31646 7.081 1.202 6.79441 1.202C6.50781 1.202 6.23309 1.31646 6.03044 1.52007C5.82787 1.72367 5.71385 1.99976 5.71385 2.28764V9.28779L6.32453 9.90218L6.36868 9.95575C6.45608 10.0888 6.44111 10.2697 6.32453 10.3868C6.2078 10.5039 6.0279 10.5185 5.89547 10.4304L5.84215 10.3868L4.60247 9.14131L4.52249 9.07435C4.32977 8.92968 4.09348 8.85283 3.851 8.85839C3.57373 8.86476 3.30933 8.97814 3.11285 9.17479C2.91636 9.37152 2.80275 9.63697 2.79544 9.91557C2.7882 10.1919 2.88653 10.4602 3.06953 10.6664L5.62054 13.2294L5.80883 13.411C6.76015 14.2938 7.85786 14.8013 9.63784 14.8014H11.06C12.4779 14.8014 13.8381 14.2359 14.8407 13.2286C15.7806 12.2842 16.3339 11.0239 16.3994 9.69627L16.4061 9.43009V7.28727C16.4061 7.03525 16.3188 6.79244 16.1612 6.59922L16.0895 6.51971C15.9121 6.34151 15.6796 6.23128 15.4322 6.20665L15.3255 6.20163C15.039 6.20165 14.7642 6.31612 14.5616 6.51971C14.3842 6.69793 14.2745 6.93157 14.25 7.18013L14.245 7.28727L14.2383 7.35674C14.2064 7.51283 14.0682 7.63046 13.9034 7.63046C13.7151 7.63031 13.5627 7.47653 13.5627 7.28727V6.57328C13.5627 6.28546 13.4486 6.00929 13.2461 5.80571C13.0435 5.60217 12.7686 5.48771 12.4821 5.48764C12.1955 5.48764 11.9208 5.6021 11.7181 5.80571C11.5155 6.00932 11.4016 6.28533 11.4016 6.57328L11.3941 6.64191C11.3623 6.79821 11.2249 6.91563 11.06 6.91563C10.895 6.91563 10.7577 6.79821 10.7259 6.64191L10.7184 6.57328ZM8.55728 4.46059C8.86488 4.22055 9.24423 4.08733 9.63784 4.08727L9.81279 4.09564C10.2163 4.13598 10.5958 4.31565 10.885 4.60623C11.0712 4.79338 11.2096 5.01878 11.2966 5.26331C11.6204 4.9675 12.0425 4.80126 12.4821 4.80126C12.9495 4.80134 13.3979 4.98818 13.7285 5.32023C13.915 5.50769 14.053 5.73395 14.14 5.97898C14.4639 5.68268 14.8855 5.51611 15.3255 5.5161L15.4997 5.52447C15.9034 5.56469 16.2834 5.74433 16.5727 6.03506L16.6894 6.1648C16.9464 6.48 17.0884 6.87622 17.0884 7.28727V9.43009L17.0809 9.73059C17.007 11.2276 16.3829 12.6483 15.323 13.7132C14.1924 14.8491 12.6589 15.4869 11.06 15.4869H9.63784C7.55572 15.4868 6.26099 14.8354 5.139 13.7157L2.57883 11.1435L2.56716 11.131C2.26394 10.7935 2.10118 10.3517 2.11311 9.89716C2.12511 9.44269 2.31078 9.01022 2.63131 8.68931C2.95183 8.36845 3.38283 8.18331 3.83517 8.17286C4.27444 8.16278 4.70062 8.31913 5.03153 8.60812V2.28764C5.03153 1.81783 5.21741 1.36679 5.54806 1.03459C5.87868 0.702562 6.32693 0.515625 6.79441 0.515625C7.26188 0.515625 7.71013 0.702562 8.04075 1.03459C8.3714 1.36679 8.55728 1.81783 8.55728 2.28764V4.46059Z"
        fill="#111111"
      />
    </svg>
  );
}

export function ImageToolbarPresetMenu({
  items,
  onSelect,
}: {
  items: WorkflowImagePresetOption[];
  onSelect: (presetId: string) => void;
}) {
  return (
    <div
      className="nodrag nopan nowheel absolute left-0 top-[calc(100%+8px)] z-50 min-w-[188px] rounded-xl px-1 py-1 text-canvas-controls-text"
      style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
      role="menu"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium leading-5 text-canvas-controls-text outline-none transition-colors hover:bg-canvas-controls-hover"
          title={item.description}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(item.id);
          }}
        >
          <span className="min-w-0 truncate">{item.label}</span>
          {WORKFLOW_IMAGE_PRESET_GROUP_LOOKUP.get(item.id) ? (
            <span className="shrink-0 rounded-md bg-canvas-controls-hover px-1.5 py-0.5 text-[10px] font-normal leading-none text-canvas-controls-text opacity-60">
              {WORKFLOW_IMAGE_PRESET_GROUP_LOOKUP.get(item.id)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export const IMAGE_TOOLBAR_PORTRAIT_TEXTURE_ITEMS: Array<{
  action: OrdinaryImageToolbarAction;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    action: "portrait-texture",
    label: "人像调节",
    icon: <ImageToolbarPortraitAdjustMenuIcon />,
  },
  {
    action: "emotion-texture",
    label: "情绪调节",
    icon: <ImageToolbarEmotionAdjustMenuIcon />,
  },
];

export function ImageToolbarPortraitTextureMenu({
  onAction,
}: {
  onAction: (action: OrdinaryImageToolbarAction) => void;
}) {
  return (
    <div
      className="nodrag nopan nowheel absolute left-0 top-[calc(100%+8px)] z-50 flex min-w-[180px] flex-col rounded-xl p-1.5 text-canvas-controls-text"
      style={{
        backgroundColor: "var(--canvas-controls-bg, #303030)",
        border:
          "0.5px solid var(--canvas-controls-border, rgba(255,255,255,0.10))",
        boxShadow:
          "var(--canvas-shadow-dropdown, 0 18px 44px rgba(0,0,0,0.42))",
      }}
      role="menu"
      data-testid="image-toolbar-portrait-texture-dropdown"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      {IMAGE_TOOLBAR_PORTRAIT_TEXTURE_ITEMS.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 text-left text-[13px] leading-none text-canvas-controls-text outline-none transition-colors hover:bg-canvas-controls-hover"
          data-testid={`image-toolbar-portrait-texture-${item.action}`}
          onClick={(event) => {
            event.stopPropagation();
            onAction(item.action);
          }}
        >
          <span className="pointer-events-none inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-80 [&_svg]:h-4 [&_svg]:w-4">
            {item.icon}
          </span>
          <span className="pointer-events-none whitespace-nowrap">
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ImageToolbarPortraitAdjustMenuIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <path
        d="M8 1.40039C9.9882 1.40058 11.5994 3.0118 11.5996 5C11.5996 6.18986 11.0214 7.24503 10.1309 7.90039C12.2004 8.50821 13.8994 10.1023 13.8994 12.4004V13.0996C13.8994 13.4862 13.5862 13.7998 13.1992 13.7998C12.8126 13.7994 12.5 13.486 12.5 13.0996V12.4004C12.5 10.2656 10.1971 9.10059 8 9.10059C5.80285 9.10059 3.5 10.2656 3.5 12.4004V13.0996C3.5 13.486 3.18735 13.7994 2.80078 13.7998C2.41385 13.7998 2.10059 13.4862 2.10059 13.0996V12.4004C2.10059 10.1023 3.79961 8.50821 5.86914 7.90039C4.97861 7.24503 4.40039 6.18986 4.40039 5C4.40058 3.0118 6.0118 1.40058 8 1.40039ZM8 2.7998C6.78501 2.79999 5.79999 3.78501 5.7998 5C5.7998 6.21515 6.78485 7.2002 8 7.2002C9.21515 7.2002 10.2002 6.21515 10.2002 5C10.2 3.78501 9.21499 2.79999 8 2.7998Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ImageToolbarEmotionAdjustMenuIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <path
        d="M8 1.33301C11.6818 1.33319 14.6668 4.31817 14.667 8C14.6668 11.6818 11.6818 14.6668 8 14.667C4.31817 14.6668 1.33319 11.6818 1.33301 8C1.33301 4.31806 4.31806 1.33301 8 1.33301ZM8 2.7334C5.09126 2.7334 2.7334 5.09126 2.7334 8C2.73358 10.9086 5.09137 13.2664 8 13.2666C10.9086 13.2664 13.2664 10.9086 13.2666 8C13.2666 5.09137 10.9087 2.73358 8 2.7334ZM5.75879 9.18066C6.08554 9.18066 6.28961 9.45373 6.45215 9.62891C6.78979 9.99297 7.28175 10.2666 8 10.2666C8.71823 10.2666 9.2102 9.99296 9.54785 9.62891C9.71039 9.45373 9.91446 9.18066 10.2412 9.18066C10.628 9.18085 10.9412 9.49401 10.9414 9.88086C10.9414 10.0368 10.8893 10.1816 10.8027 10.2988C10.1881 11.1324 9.2767 11.667 8 11.667C6.72329 11.667 5.81189 11.1324 5.19727 10.2988C5.11066 10.1816 5.05859 10.0368 5.05859 9.88086C5.05878 9.49401 5.37197 9.18085 5.75879 9.18066ZM5.66699 5.83301C6.21928 5.83301 6.66699 6.28072 6.66699 6.83301C6.66699 7.38529 6.21928 7.83301 5.66699 7.83301C5.11471 7.83301 4.66699 7.38529 4.66699 6.83301C4.66699 6.28072 5.11471 5.83301 5.66699 5.83301ZM10.333 5.83301C10.8853 5.83301 11.333 6.28072 11.333 6.83301C11.333 7.38529 10.8853 7.83301 10.333 7.83301C9.78072 7.83301 9.33301 7.38529 9.33301 6.83301C9.33301 6.28072 9.78072 5.83301 10.333 5.83301Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const IMAGE_TOOLBAR_PRIMARY_TOOL_ITEMS: Array<{
  action: OrdinaryImageToolbarAction;
  label: string;
  icon: React.ReactNode;
}> = [
  { action: "enhance", label: "高清", icon: <ImageToolbarHdIcon /> },
  { action: "expand", label: "扩图", icon: <ImageToolbarExpandIcon /> },
  { action: "edit", label: "重绘", icon: <ImageToolbarRepaintIcon /> },
  { action: "erase", label: "擦除", icon: <ImageToolbarEraseIcon /> },
  { action: "remove-bg", label: "抠图", icon: <ImageToolbarCutoutIcon /> },
  { action: "crop", label: "裁剪", icon: <ImageToolbarCropIcon /> },
];

export function ImageToolbarPrimaryToolMenu({
  onAction,
}: {
  onAction: (action: OrdinaryImageToolbarAction) => void;
}) {
  return (
    <div
      className="nodrag nopan nowheel absolute left-0 top-[calc(100%+8px)] z-50 flex min-w-[166px] flex-col gap-1 rounded-xl p-1.5 text-[var(--canvas-controls-text,#fff)]"
      style={{
        backgroundColor: "var(--canvas-controls-bg, #262626)",
        border: "0.5px solid var(--canvas-controls-border, #363636)",
        boxShadow:
          "var(--canvas-shadow-dropdown, 0 18px 44px rgba(0,0,0,0.42))",
      }}
      role="menu"
      data-testid="image-editor-primary-tool-dropdown"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      {IMAGE_TOOLBAR_PRIMARY_TOOL_ITEMS.map((item, index) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={`flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 text-left text-[13px] leading-none text-canvas-controls-text outline-none transition-colors hover:bg-canvas-controls-hover ${index === 0 ? "bg-canvas-controls-hover" : ""}`}
          data-testid={`image-editor-primary-tool-${item.action}`}
          onClick={(event) => {
            event.stopPropagation();
            onAction(item.action);
          }}
        >
          <span className="pointer-events-none inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-70 [&_svg]:h-4 [&_svg]:w-4">
            {item.icon}
          </span>
          <span className="pointer-events-none whitespace-nowrap">
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export const IMAGE_TOOLBAR_GRID_SPLIT_ITEMS: Array<{
  action: OrdinaryImageToolbarAction;
  label: string;
  dividerBefore?: boolean;
  submenu?: boolean;
}> = [
  { action: "split-2", label: "4宫格 (2×2)" },
  { action: "split-3", label: "9宫格 (3×3)" },
  { action: "split-4", label: "16宫格 (4×4)" },
  { action: "split-5", label: "25宫格 (5×5)" },
  { action: "grid-split", label: "自定义", dividerBefore: true, submenu: true },
];

export function ImageToolbarGridSplitMenu({
  onAction,
}: {
  onAction: (
    action: OrdinaryImageToolbarAction,
    options?: OrdinaryImageToolbarActionOptions,
  ) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customHover, setCustomHover] = useState<{
    row: number;
    col: number;
  } | null>(null);
  return (
    <div
      className="nodrag nopan nowheel absolute right-0 top-[calc(100%+8px)] z-50 flex min-w-[170px] flex-col rounded-xl p-2 text-[var(--canvas-controls-text,#fff)]"
      style={{
        backgroundColor: "var(--canvas-controls-bg, #303030)",
        border:
          "0.5px solid var(--canvas-controls-border, rgba(255,255,255,0.10))",
        boxShadow:
          "var(--canvas-shadow-dropdown, 0 18px 44px rgba(0,0,0,0.42))",
      }}
      role="menu"
      data-testid="image-toolbar-grid-split-dropdown"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
      onPointerLeave={() => {
        setCustomOpen(false);
        setCustomHover(null);
      }}
    >
      {IMAGE_TOOLBAR_GRID_SPLIT_ITEMS.map((item) => (
        <React.Fragment key={item.action}>
          {item.dividerBefore ? (
            <div className="mx-2 my-1 h-px bg-[var(--canvas-controls-border,rgba(255,255,255,0.12))]" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={`flex h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-left text-[13px] leading-none text-canvas-controls-text outline-none transition-colors hover:bg-canvas-controls-hover ${item.submenu && customOpen ? "bg-canvas-controls-hover" : ""}`}
            data-testid={`image-toolbar-grid-split-${item.action}`}
            onPointerEnter={() => {
              if (item.submenu) setCustomOpen(true);
            }}
            onFocus={() => {
              if (item.submenu) setCustomOpen(true);
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (item.submenu) {
                setCustomOpen(true);
                return;
              }
              onAction(item.action);
            }}
          >
            <span className="pointer-events-none whitespace-nowrap">
              {item.label}
            </span>
            {item.submenu ? <ImageToolbarMenuRightChevronIcon /> : null}
          </button>
        </React.Fragment>
      ))}
      {customOpen ? (
        <div
          className="nodrag nopan nowheel absolute left-[calc(100%+8px)] top-0 z-[51] w-[286px] rounded-xl p-6 text-canvas-controls-text"
          style={{
            backgroundColor: "var(--canvas-controls-bg, #303030)",
            border:
              "0.5px solid var(--canvas-controls-border, rgba(255,255,255,0.10))",
            boxShadow:
              "var(--canvas-shadow-dropdown, 0 18px 44px rgba(0,0,0,0.42))",
          }}
          role="menu"
          data-testid="image-toolbar-grid-split-custom-panel"
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <div className="mb-4 text-[13px] leading-none text-canvas-controls-text opacity-60">
            自定义宫格
          </div>
          <div className="grid grid-cols-5 gap-2.5">
            {Array.from({ length: 25 }, (_, index) => {
              const row = Math.floor(index / 5) + 1;
              const col = (index % 5) + 1;
              const active = customHover
                ? row <= customHover.row && col <= customHover.col
                : false;
              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  aria-label={`${row}×${col} 自定义宫格`}
                  className="h-10 w-10 rounded transition-colors"
                  style={{
                    backgroundColor: active
                      ? "color-mix(in srgb, var(--canvas-controls-text, #ffffff) 34%, transparent)"
                      : "var(--canvas-controls-hover, rgba(255,255,255,0.10))",
                  }}
                  data-testid={`image-toolbar-grid-split-custom-${row}-${col}`}
                  onPointerEnter={() => setCustomHover({ row, col })}
                  onFocus={() => setCustomHover({ row, col })}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAction("grid-split", {
                      gridRows: row,
                      gridColumns: col,
                    });
                  }}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ImageToolbarMenuRightChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-3 w-3 shrink-0 opacity-70"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <g transform="translate(5.8234 4.3472)">
        <path
          d="M0.117182 1.10737C-0.0390471 0.951169 -0.039074 0.697193 0.117182 0.540965L0.54101 0.117137C0.697203 -0.039057 0.9512 -0.039034 1.10742 0.117137L4.14843 3.15718C4.42165 3.43043 4.42145 3.87403 4.14843 4.14741L1.10742 7.18843C0.951206 7.34464 0.69722 7.34464 0.54101 7.18843L0.117182 6.7646C-0.039028 6.60839 -0.039028 6.3544 0.117182 6.19819L2.66308 3.65229L0.117182 1.10737Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function OrdinaryImageToolbarButton({
  label,
  icon,
  active,
  dot,
  menu,
  chevronUp,
  newBadge,
  testId,
  quickGuideAnchor,
  text,
  disabled,
  compact = false,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  dot?: boolean;
  menu?: boolean;
  chevronUp?: boolean;
  newBadge?: boolean;
  testId?: string;
  quickGuideAnchor?: string;
  text?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`group/button text-canvas-controls-text relative z-0 inline-flex h-8 cursor-pointer select-none items-center justify-center rounded-lg transition-colors hover:bg-canvas-controls-hover active:bg-canvas-controls-active disabled:cursor-not-allowed disabled:opacity-50 ${text ? "gap-1 px-2 py-2" : "w-8 min-w-8 gap-0 p-2"} ${active ? "bg-canvas-controls-active" : ""}`}
      data-testid={testId}
      data-quick-guide-anchor={quickGuideAnchor}
      aria-label={label}
      aria-haspopup={menu ? "menu" : undefined}
      aria-expanded={menu ? active || false : undefined}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick?.();
      }}
    >
      <span
        className={`pointer-events-none inline-flex shrink-0 items-center justify-center ${compact ? "h-3.5 w-3.5 [&_svg]:h-3.5 [&_svg]:w-3.5" : "h-4 w-4 [&_svg]:h-4 [&_svg]:w-4"}`}
      >
        {icon}
      </span>
      {text ? (
        <span className="pointer-events-none whitespace-nowrap text-[13px]">
          {label}
        </span>
      ) : null}
      {newBadge ? (
        <span className="pointer-events-none ml-0.5 flex h-5 w-[42px] shrink-0 items-center justify-center rounded-full bg-[#3CB5CC40] text-[12px] font-bold uppercase leading-none text-[#5DDCFF]">
          NEW
        </span>
      ) : null}
      {menu ? (
        text ? (
          <ImageToolbarChevronIcon up={chevronUp} />
        ) : (
          <ChevronDown className="pointer-events-none absolute bottom-1 right-1 size-2.5 shrink-0 opacity-60" />
        )
      ) : null}
      {dot ? (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />
      ) : null}
      <span
        className={`pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 min-w-max -translate-x-1/2 rounded-md px-2 py-1 text-[11px] leading-none text-canvas-controls-text ${text ? "hidden" : "hidden group-hover/button:block"}`}
        style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
      >
        {label}
      </span>
    </button>
  );
}
