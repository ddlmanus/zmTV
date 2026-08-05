"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ImageIcon, RefreshCw, X } from "lucide-react";
import {
  ANGLE_EDIT_DEFAULT_CONTROLS,
  ANGLE_EDIT_RUN_CREDITS,
  ANGLE_EDIT_TILT_MAX,
  ANGLE_EDIT_TILT_MIN,
  ANGLE_EDIT_ZOOM_MAX,
  ANGLE_EDIT_ZOOM_MIN,
  buildAngleEditPrompt,
  clampAngleEditValue,
  type AngleEditControls,
} from "@/workflow/ideart/components/editor/angle-edit-utils";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { getWorkflowImageRenderUrl } from "./workflow-media-utils";
import { SparklesTokenIcon } from "./workflow-icons";
import type { WorkflowAngleEditCreateRequest } from "./surface-contracts";

export const WORKFLOW_ANGLE_DEFAULT_CONTROLS: AngleEditControls = {
  ...ANGLE_EDIT_DEFAULT_CONTROLS,
  mode: "camera",
  rotation: 45,
  tilt: 30,
  zoom: 0,
};

export const WORKFLOW_ANGLE_ROTATION_MIN = 0;

export const WORKFLOW_ANGLE_ROTATION_MAX = 315;

export const WORKFLOW_ANGLE_PRESETS = [
  { id: "custom", label: "自定义", controls: WORKFLOW_ANGLE_DEFAULT_CONTROLS },
  {
    id: "fisheye",
    label: "鱼眼视角",
    controls: {
      ...WORKFLOW_ANGLE_DEFAULT_CONTROLS,
      rotation: 0,
      tilt: 30,
      zoom: 10,
      wideAngle: true,
      promptEnabled: true,
      promptText: "极度特写镜头，广角镜头，边缘带有鱼眼畸变效果",
    },
  },
  {
    id: "dutch",
    label: "倾斜视角",
    controls: {
      ...WORKFLOW_ANGLE_DEFAULT_CONTROLS,
      rotation: 45,
      tilt: -30,
      zoom: 5,
      promptEnabled: true,
      promptText: "dutch angle，tilted frame",
    },
  },
  {
    id: "front-top",
    label: "正面俯拍",
    controls: {
      ...WORKFLOW_ANGLE_DEFAULT_CONTROLS,
      rotation: 0,
      tilt: 60,
      zoom: 5,
    },
  },
  {
    id: "front-low",
    label: "正面仰拍",
    controls: {
      ...WORKFLOW_ANGLE_DEFAULT_CONTROLS,
      rotation: 0,
      tilt: -30,
      zoom: 5,
    },
  },
  {
    id: "panorama-top",
    label: "全景俯拍",
    controls: {
      ...WORKFLOW_ANGLE_DEFAULT_CONTROLS,
      rotation: 45,
      tilt: 30,
      zoom: 0,
      wideAngle: false,
      promptEnabled: false,
      promptText: "",
    },
  },
  {
    id: "back",
    label: "背面视角",
    controls: {
      ...WORKFLOW_ANGLE_DEFAULT_CONTROLS,
      rotation: 180,
      tilt: 0,
      zoom: 5,
    },
  },
] as const;

export type WorkflowAnglePresetId =
  (typeof WORKFLOW_ANGLE_PRESETS)[number]["id"];

export function roundWorkflowAngleStep(value: number, step: number) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function getWorkflowAngleZoomLabel(value: number) {
  if (value <= 0) return "全景";
  if (value <= 5) return "中景";
  return "特写";
}

export function WorkflowAngleSlider({
  label,
  min,
  max,
  step,
  centerValue,
  value,
  displayValue,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  centerValue?: number;
  value: number;
  displayValue: string;
  onChange: (value: number) => void;
}) {
  const percent = clampAngleEditValue(
    ((value - min) / (max - min)) * 100,
    0,
    100,
  );
  const origin = typeof centerValue === "number" ? centerValue : min;
  const originPercent = clampAngleEditValue(
    ((origin - min) / (max - min)) * 100,
    0,
    100,
  );
  const activeStart = Math.min(originPercent, percent);
  const activeEnd = Math.max(originPercent, percent);
  const background = `linear-gradient(to right, var(--angle-slider-inactive) 0%, var(--angle-slider-inactive) ${activeStart}%, var(--color-brand-400) ${activeStart}%, var(--color-brand-400) ${activeEnd}%, var(--angle-slider-inactive) ${activeEnd}%, var(--angle-slider-inactive) 100%)`;

  return (
    <div className="angle-editor-camera-mode-setting-row">
      <div className="angle-editor-camera-mode-setting-label">{label}</div>
      <div className="angle-editor-camera-mode-setting-slider">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className="angle-editor-camera-mode-setting-range"
          style={{ background }}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <div className="angle-editor-camera-mode-setting-value">
        {displayValue}
      </div>
    </div>
  );
}

export function WorkflowAngleCube({
  imageUrl,
  zoom,
}: {
  imageUrl: string;
  zoom: number;
}) {
  const renderUrl = getWorkflowImageRenderUrl(imageUrl);
  const cubeScale =
    1 +
    clampAngleEditValue(zoom, ANGLE_EDIT_ZOOM_MIN, ANGLE_EDIT_ZOOM_MAX) / 20;
  return (
    <div
      className="unified-scene-cube-container as-reference"
      style={{ zIndex: 0, opacity: 1 }}
    >
      <div className="angle-editor-scene-cube as-reference">
        <div
          className="angle-editor-cube3d-container"
          style={{ cursor: "grab" }}
        >
          <div
            className="angle-editor-scene-container"
            style={{ perspective: "1200px" }}
          >
            <div
              className="angle-editor-cube-wrapper"
              style={{
                transition: "transform 0.1s ease-out",
                transform: `scale(${cubeScale}) rotateX(0deg) rotateY(0deg)`,
              }}
            >
              <div className="angle-editor-cube">
                <div
                  className="angle-editor-cube-face angle-editor-face-front"
                  style={{ cursor: "default" }}
                >
                  {renderUrl ? (
                    <img
                      className="angle-editor-face-image-content"
                      alt=""
                      src={renderUrl}
                      draggable={false}
                    />
                  ) : (
                    <ImageIcon className="size-8 text-white/70" />
                  )}
                </div>
                <div className="angle-editor-cube-face angle-editor-face-back">
                  B
                </div>
                <div className="angle-editor-cube-face angle-editor-face-right">
                  R
                </div>
                <div className="angle-editor-cube-face angle-editor-face-left">
                  L
                </div>
                <div className="angle-editor-cube-face angle-editor-face-top">
                  T
                </div>
                <div className="angle-editor-cube-face angle-editor-face-bottom">
                  B
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowAngleSphereGrid({
  rotation,
  tilt,
}: {
  rotation: number;
  tilt: number;
}) {
  const parallels = [
    { size: 144.75, y: 19.5 },
    { size: 144.75, y: -19.5 },
    { size: 129.75, y: 37.5 },
    { size: 129.75, y: -37.5 },
    { size: 105.75, y: 53.25 },
    { size: 105.75, y: -53.25 },
    { size: 75, y: 65.25 },
    { size: 75, y: -65.25 },
  ];
  const helpers = [
    { top: "50%", width: 150 },
    { top: "calc(50% + 19.5px)", width: 144.75 },
    { top: "calc(50% - 19.5px)", width: 144.75 },
    { top: "calc(50% + 37.5px)", width: 129.75 },
    { top: "calc(50% - 37.5px)", width: 129.75 },
    { top: "calc(50% + 53.25px)", width: 105.75 },
    { top: "calc(50% - 53.25px)", width: 105.75 },
    { top: "calc(50% + 65.25px)", width: 75 },
    { top: "calc(50% - 65.25px)", width: 75 },
  ];

  return (
    <div className="angle-editor-sphere-grid">
      <div
        className="angle-editor-sphere-grid-inner"
        style={{ transform: `rotateX(${tilt}deg) rotateY(${rotation}deg)` }}
      >
        {Array.from({ length: 12 }, (_, index) => index * 15).map((angle) => (
          <div
            key={`meridian-${angle}`}
            className="angle-editor-sphere-grid-meridian"
            style={{ transform: `rotateY(${angle}deg)` }}
          />
        ))}
        <div
          className="angle-editor-sphere-grid-meridian"
          style={{ transform: "rotateX(90deg)" }}
        />
        {parallels.map((parallel, index) => (
          <div
            key={`parallel-${index}`}
            className="angle-editor-sphere-grid-parallel"
            style={{
              width: parallel.size,
              height: parallel.size,
              transform: `translate(-50%, -50%) translateY(${parallel.y}px) rotateX(90deg)`,
            }}
          />
        ))}
      </div>
      <div
        className="angle-editor-sphere-grid-helper-vertical"
        style={{ opacity: 1 }}
      />
      <div
        className="angle-editor-sphere-grid-helper-horizontals"
        style={{ opacity: 1 }}
      >
        {helpers.map((helper, index) => (
          <div
            key={`helper-${index}`}
            className="angle-editor-sphere-grid-helper-horizontal"
            style={{ top: helper.top, width: helper.width }}
          />
        ))}
      </div>
    </div>
  );
}

export function WorkflowAngleCamera3D({
  imageUrl,
  rotation,
  tilt,
  zoom,
}: {
  imageUrl: string;
  rotation: number;
  tilt: number;
  zoom: number;
}) {
  const renderUrl = getWorkflowImageRenderUrl(imageUrl);
  const cameraScale = zoom <= 0 ? 0.88 : zoom >= 10 ? 1.12 : 1;
  const screenBackground = renderUrl
    ? {
        backgroundImage: `url("${renderUrl}")`,
        backgroundSize: "150%",
        transform: `rotateX(${-tilt}deg) rotateY(${-rotation}deg)`,
      }
    : undefined;
  return (
    <div className="angle-editor-scene-camera" style={{ zIndex: 2 }}>
      <div
        className="angle-editor-camera-3d-pivot"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt}deg) rotateY(${rotation}deg)`,
        }}
      >
        <div
          className="angle-editor-camera-3d-position"
          style={{
            transformStyle: "preserve-3d",
            transform: `translateZ(75px) scale(${cameraScale}) rotateZ(0deg)`,
          }}
        >
          <div
            className="angle-editor-camera-3d-body angle-editor-camera-3d-front"
            style={{ transform: "translate(-50%, -50%) translateZ(-8px)" }}
          >
            <div className="angle-editor-camera-3d-lens-outer">
              <div className="angle-editor-camera-3d-lens-inner" />
            </div>
            <div className="angle-editor-camera-3d-indicator" />
          </div>
          <div
            className="angle-editor-camera-3d-body angle-editor-camera-3d-back"
            style={{ transform: "translate(-50%, -50%) translateZ(8px)" }}
          >
            <div
              className="angle-editor-camera-3d-screen"
              style={screenBackground}
            />
          </div>
          <div
            className="angle-editor-camera-3d-body angle-editor-camera-3d-top"
            style={{
              transform: "translate(-50%, -50%) rotateX(90deg) translateZ(9px)",
            }}
          >
            <div className="angle-editor-camera-3d-shutter" />
          </div>
          <div
            className="angle-editor-camera-3d-body angle-editor-camera-3d-bottom"
            style={{
              transform:
                "translate(-50%, -50%) rotateX(-90deg) translateZ(9px)",
            }}
          />
          <div
            className="angle-editor-camera-3d-body angle-editor-camera-3d-side"
            style={{
              transform:
                "translate(-50%, -50%) rotateY(-90deg) translateZ(12px)",
            }}
          />
          <div
            className="angle-editor-camera-3d-body angle-editor-camera-3d-side"
            style={{
              transform:
                "translate(-50%, -50%) rotateY(90deg) translateZ(12px)",
            }}
          />
          <div
            className="angle-editor-camera-3d-hotshoe"
            style={{
              transformStyle: "preserve-3d",
              transform: "translate(-50%, -50%) translateY(-12px)",
            }}
          >
            <div
              className="angle-editor-camera-3d-hotshoe-body"
              style={{ transform: "translate(-50%, -50%) translateZ(2px)" }}
            >
              <div className="angle-editor-camera-3d-hotshoe-mount" />
            </div>
          </div>
          <div
            className="angle-editor-camera-3d-line"
            style={{
              height: 69,
              transform:
                "translate(-50%, 0px) translateZ(-8px) rotateX(-90deg)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function WorkflowAngleDirectionButton({
  direction,
  onClick,
}: {
  direction: "up" | "down" | "left" | "right";
  onClick: () => void;
}) {
  const paths = {
    up: "M8 13.9999L11.6464 10.3535C11.8417 10.1582 12.1583 10.1582 12.3536 10.3535L16 13.9999",
    down: "M8 10L11.6464 13.6464C11.8417 13.8417 12.1583 13.8417 12.3536 13.6464L16 10",
    left: "M13.7929 16L10.1464 12.3536C9.95118 12.1583 9.95118 11.8417 10.1464 11.6464L13.7929 8",
    right:
      "M10 16L13.6464 12.3536C13.8417 12.1583 13.8417 11.8417 13.6464 11.6464L10 8",
  };
  return (
    <button
      type="button"
      className={`angle-editor-direction-btn angle-editor-direction-btn-${direction}`}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d={paths[direction]}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function WorkflowAngleEditPanel({
  imageUrl,
  title,
  modelId,
  workflowEndpointMethod,
  aspectRatio,
  imageSize,
  workflowExtraParameters,
  onClose,
  onSubmit,
}: {
  imageUrl: string;
  title: string;
  modelId?: string;
  workflowEndpointMethod?: string;
  aspectRatio?: string;
  imageSize?: string;
  workflowExtraParameters?: WorkflowAngleEditCreateRequest["workflowExtraParameters"];
  onClose: () => void;
  onSubmit: (request: WorkflowAngleEditCreateRequest) => void;
}) {
  const [controls, setControls] = useState<AngleEditControls>(
    WORKFLOW_ANGLE_DEFAULT_CONTROLS,
  );
  const [activePreset, setActivePreset] =
    useState<WorkflowAnglePresetId>("custom");
  const [isRunning, setIsRunning] = useState(false);
  const updateControl = useCallback(
    <K extends keyof AngleEditControls>(
      key: K,
      value: AngleEditControls[K],
    ) => {
      setActivePreset("custom");
      setControls((current) => ({ ...current, [key]: value }));
    },
    [],
  );
  const prompt = useMemo(() => buildAngleEditPrompt(controls), [controls]);
  const applyControls = useCallback(
    (
      nextControls: AngleEditControls,
      nextPreset: WorkflowAnglePresetId = "custom",
    ) => {
      setActivePreset(nextPreset);
      setControls({
        ...WORKFLOW_ANGLE_DEFAULT_CONTROLS,
        ...nextControls,
        mode: "camera",
      });
    },
    [],
  );

  const stepRotation = useCallback((delta: number) => {
    setActivePreset("custom");
    setControls((current) => ({
      ...current,
      rotation: clampAngleEditValue(
        roundWorkflowAngleStep((current.rotation || 0) + delta, 45),
        WORKFLOW_ANGLE_ROTATION_MIN,
        WORKFLOW_ANGLE_ROTATION_MAX,
      ),
    }));
  }, []);

  const stepTilt = useCallback((delta: number) => {
    setActivePreset("custom");
    setControls((current) => ({
      ...current,
      tilt: clampAngleEditValue(
        roundWorkflowAngleStep((current.tilt || 0) + delta, 30),
        ANGLE_EDIT_TILT_MIN,
        ANGLE_EDIT_TILT_MAX,
      ),
    }));
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const startRotation = controls.rotation;
      const startTilt = controls.tilt;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        setControls((current) => ({
          ...current,
          rotation: clampAngleEditValue(
            roundWorkflowAngleStep(startRotation + dx * 0.5, 45),
            WORKFLOW_ANGLE_ROTATION_MIN,
            WORKFLOW_ANGLE_ROTATION_MAX,
          ),
          tilt: clampAngleEditValue(
            roundWorkflowAngleStep(startTilt - dy * 0.5, 30),
            ANGLE_EDIT_TILT_MIN,
            ANGLE_EDIT_TILT_MAX,
          ),
        }));
        setActivePreset("custom");
      };
      const handleUp = () => {
        target.releasePointerCapture(event.pointerId);
        target.removeEventListener("pointermove", handleMove);
        target.removeEventListener("pointerup", handleUp);
      };
      target.addEventListener("pointermove", handleMove);
      target.addEventListener("pointerup", handleUp);
    },
    [controls.rotation, controls.tilt],
  );

  const run = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      onSubmit({
        controls,
        prompt,
        modelId: modelId || undefined,
        workflowEndpointMethod: workflowEndpointMethod || undefined,
        aspectRatio: aspectRatio || undefined,
        imageSize: imageSize || undefined,
        workflowExtraParameters,
      });
      onClose();
    } catch (error) {
      console.error("[Workflow angle edit] failed", error);
    } finally {
      setIsRunning(false);
    }
  }, [
    aspectRatio,
    controls,
    imageSize,
    isRunning,
    modelId,
    onClose,
    onSubmit,
    prompt,
    workflowEndpointMethod,
    workflowExtraParameters,
  ]);

  return (
    <div
      className="workflow-angle-editor-v3 nodrag nopan nowheel pointer-events-auto absolute left-1/2 top-full z-50 mt-3 -translate-x-1/2"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="angle-editor-v3 mode-camera"
        style={
          {
            "--angle-slider-inactive": "#86909c",
            "--angle-scene-bg": "#363636",
            "--angle-sphere-line": "#ffffff26",
            "--angle-sphere-helper": "#ffffff14",
            "--canvas-controls-bg": "#1a1a1a",
            "--canvas-controls-border": "rgba(255,255,255,0.10)",
            "--canvas-controls-hover": "rgba(255,255,255,0.08)",
            "--canvas-controls-active": "#363636",
            "--fg-default": "#f7f7f7",
            "--fg-muted": "#919191",
            "--color-brand-400": "#09caf5",
            "--bg-btn-invert-bg": "#ffffff",
            "--btn-invert-text": "#0a0a0a",
            "--input-placeholder": "rgba(255,255,255,0.32)",
          } as React.CSSProperties
        }
      >
        <header className="angle-editor-v3-header">
          <h1 className="angle-editor-v3-title">
            <span>多角度编辑器</span>
          </h1>
          <button
            type="button"
            className="angle-editor-v3-close-btn"
            aria-label="关闭多角度"
            onClick={onClose}
          >
            <X className="size-6" strokeWidth={2} />
          </button>
        </header>

        <div className="angle-editor-v3-presets">
          {WORKFLOW_ANGLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`angle-editor-v3-preset-btn ${activePreset === preset.id ? "active" : ""}`}
              onClick={() => {
                if (preset.id === "custom") {
                  setActivePreset("custom");
                  return;
                }
                applyControls(preset.controls, preset.id);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="angle-editor-v3-body">
          <div className="angle-editor-v3-scene">
            <div
              className="unified-scene mode-camera"
              style={{ perspective: "1200px", cursor: "grab" }}
              onPointerDown={handlePointerDown}
            >
              <WorkflowAngleCube imageUrl={imageUrl} zoom={controls.zoom} />
              <WorkflowAngleSphereGrid
                rotation={controls.rotation}
                tilt={controls.tilt}
              />
              <WorkflowAngleCamera3D
                imageUrl={imageUrl}
                rotation={controls.rotation}
                tilt={controls.tilt}
                zoom={controls.zoom}
              />
              <WorkflowAngleDirectionButton
                direction="up"
                onClick={() => stepTilt(30)}
              />
              <WorkflowAngleDirectionButton
                direction="down"
                onClick={() => stepTilt(-30)}
              />
              <WorkflowAngleDirectionButton
                direction="left"
                onClick={() => stepRotation(-45)}
              />
              <WorkflowAngleDirectionButton
                direction="right"
                onClick={() => stepRotation(45)}
              />
            </div>
          </div>
          <div className="angle-editor-v3-controls">
            <div className="angle-editor-camera-mode-panel">
              <div className="angle-editor-camera-mode-settings">
                <WorkflowAngleSlider
                  label="水平环绕"
                  min={WORKFLOW_ANGLE_ROTATION_MIN}
                  max={WORKFLOW_ANGLE_ROTATION_MAX}
                  step={45}
                  centerValue={0}
                  value={controls.rotation}
                  displayValue={`${controls.rotation}°`}
                  onChange={(value) =>
                    updateControl("rotation", Math.round(value))
                  }
                />
                <WorkflowAngleSlider
                  label="垂直俯仰"
                  min={ANGLE_EDIT_TILT_MIN}
                  max={ANGLE_EDIT_TILT_MAX}
                  step={30}
                  centerValue={0}
                  value={controls.tilt}
                  displayValue={`${controls.tilt}°`}
                  onChange={(value) => updateControl("tilt", Math.round(value))}
                />
                <WorkflowAngleSlider
                  label="景别缩放"
                  min={ANGLE_EDIT_ZOOM_MIN}
                  max={ANGLE_EDIT_ZOOM_MAX}
                  step={5}
                  centerValue={5}
                  value={controls.zoom}
                  displayValue={getWorkflowAngleZoomLabel(controls.zoom)}
                  onChange={(value) => updateControl("zoom", Math.round(value))}
                />
              </div>
              <div className="angle-editor-camera-mode-prompt-section">
                <div className="angle-editor-toggle-row">
                  <label>提示词</label>
                  <button
                    type="button"
                    className={`angle-editor-toggle-switch ${controls.promptEnabled ? "active" : ""}`}
                    role="switch"
                    aria-checked={Boolean(controls.promptEnabled)}
                    onClick={() =>
                      updateControl("promptEnabled", !controls.promptEnabled)
                    }
                  >
                    <div className="angle-editor-toggle-thumb" />
                  </button>
                </div>
                {controls.promptEnabled ? (
                  <div className="angle-editor-camera-mode-prompt-box">
                    <textarea
                      className="angle-editor-camera-mode-prompt-textarea"
                      value={controls.promptText || ""}
                      rows={2}
                      placeholder="输入额外视角提示词"
                      onChange={(event) =>
                        updateControl("promptText", event.target.value)
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="angle-editor-v3-footer">
          <button
            type="button"
            className="angle-editor-v3-reset-btn"
            onClick={() =>
              applyControls(WORKFLOW_ANGLE_DEFAULT_CONTROLS, "custom")
            }
          >
            <RefreshCw className="size-4" />
            重置参数
          </button>
          <div className="angle-editor-v3-footer-spacer" />
          <div className="angle-editor-v3-send">
            <span className="angle-editor-v3-token">
              <SparklesTokenIcon className="h-[14px] w-[10px]" />
              <span>{ANGLE_EDIT_RUN_CREDITS}</span>
            </span>
            <button
              type="button"
              className="angle-editor-v3-send-btn"
              aria-label={`生成${title ? ` ${title}` : ""}多角度`}
              disabled={isRunning}
              onClick={run}
            >
              {isRunning ? (
                <span className="size-3 animate-spin rounded-full border-2 border-black/25 border-t-black" />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <path
                    d="M8.29289 0.292893C8.68342 -0.0976311 9.31658 -0.0976311 9.70711 0.292893L17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711C17.3166 10.0976 16.6834 10.0976 16.2929 9.70711L10 3.41421V17C10 17.5523 9.55229 18 9 18C8.44772 18 8 17.5523 8 17V3.41421L1.70711 9.70711C1.31658 10.0976 0.683418 10.0976 0.292893 9.70711C-0.0976311 9.31658 -0.0976311 8.68342 0.292893 8.29289L8.29289 0.292893Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .workflow-angle-editor-v3 .angle-editor-v3 {
          --angle-slider-inactive: #86909c;
          --angle-scene-bg: #363636;
          --angle-sphere-line: #ffffff26;
          --angle-sphere-helper: #ffffff14;
          background: var(--canvas-controls-bg);
          border: 0.5px solid var(--canvas-controls-border);
          width: 600px;
          color: var(--fg-default);
          border-radius: 12px;
          flex-direction: column;
          gap: 12px;
          padding: 12px 8px 8px;
          font-family:
            PingFang SC,
            -apple-system,
            BlinkMacSystemFont,
            Segoe UI,
            Roboto,
            Oxygen,
            Ubuntu,
            Cantarell,
            Open Sans,
            Helvetica Neue,
            sans-serif;
          display: flex;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
        }
        .workflow-angle-editor-v3 .angle-editor-v3-header {
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 0 8px;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-title {
          color: var(--fg-default);
          flex: 1;
          margin: 0;
          padding: 0;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-close-btn {
          width: 24px;
          height: 24px;
          color: var(--fg-muted);
          cursor: pointer;
          background: transparent;
          border: none;
          border-radius: 8px;
          justify-content: center;
          align-items: center;
          padding: 0;
          transition: all 0.15s;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-close-btn:hover {
          background: var(--canvas-controls-hover);
          color: var(--fg-default);
        }
        .workflow-angle-editor-v3 .angle-editor-v3-presets {
          flex-wrap: wrap;
          gap: 8px;
          padding: 0 8px;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-preset-btn {
          border: 0.5px solid var(--canvas-controls-border);
          color: var(--fg-muted);
          cursor: pointer;
          white-space: nowrap;
          background: transparent;
          border-radius: 6px;
          padding: 4px 12px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.6;
          transition: all 0.15s;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-preset-btn:hover {
          background: var(--canvas-controls-hover);
          color: var(--fg-default);
        }
        .workflow-angle-editor-v3 .angle-editor-v3-preset-btn.active {
          background: var(--canvas-controls-active);
          color: var(--fg-default);
          border-color: var(--canvas-controls-border);
          font-weight: 500;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-body {
          gap: 8px;
          padding: 0 0 0 8px;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-scene {
          flex: 0 0 240px;
          height: 240px;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-controls {
          flex-direction: column;
          flex: 1;
          min-width: 0;
          display: flex;
        }
        .workflow-angle-editor-v3 .unified-scene {
          perspective-origin: 50%;
          width: 100%;
          height: 100%;
          min-height: 0;
          transform-style: preserve-3d;
          background: var(--angle-scene-bg, #363636);
          border-radius: 12px;
          position: relative;
          overflow: hidden;
        }
        .workflow-angle-editor-v3 .unified-scene-cube-container {
          transform-style: preserve-3d;
          justify-content: center;
          align-items: center;
          display: flex;
          position: absolute;
          inset: 0;
        }
        .workflow-angle-editor-v3 .angle-editor-scene-cube {
          justify-content: center;
          align-items: center;
          transition:
            transform 0.3s ease-out,
            opacity 0.3s ease-out;
          display: flex;
          position: relative;
        }
        .workflow-angle-editor-v3 .angle-editor-scene-cube.as-reference {
          transform: scale(0.4);
        }
        .workflow-angle-editor-v3 .angle-editor-cube3d-container {
          cursor: grab;
          user-select: none;
          background-color: transparent;
          border-radius: 20px;
          flex: 1;
          justify-content: center;
          align-items: center;
          width: 500px;
          height: 500px;
          display: flex;
          position: relative;
          overflow: hidden;
        }
        .workflow-angle-editor-v3
          .angle-editor-scene-cube.as-reference
          .angle-editor-cube3d-container {
          cursor: default;
        }
        .workflow-angle-editor-v3 .angle-editor-scene-container {
          perspective: 1000px;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 100%;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-cube-wrapper {
          width: 120px;
          height: 120px;
          transform-style: preserve-3d;
          transition: transform 0.1s ease-out;
          position: relative;
        }
        .workflow-angle-editor-v3 .angle-editor-cube {
          width: 120px;
          height: 120px;
          transform-style: preserve-3d;
          position: absolute;
        }
        .workflow-angle-editor-v3 .angle-editor-cube-face {
          width: 120px;
          height: 120px;
          background: #333;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
          overflow: hidden;
          position: absolute;
          backface-visibility: hidden;
        }
        .workflow-angle-editor-v3 .angle-editor-face-front {
          transform: translateZ(60px);
        }
        .workflow-angle-editor-v3 .angle-editor-face-back {
          transform: rotateY(180deg) translateZ(60px);
        }
        .workflow-angle-editor-v3 .angle-editor-face-right {
          transform: rotateY(90deg) translateZ(60px);
        }
        .workflow-angle-editor-v3 .angle-editor-face-left {
          transform: rotateY(-90deg) translateZ(60px);
        }
        .workflow-angle-editor-v3 .angle-editor-face-top {
          transform: rotateX(90deg) translateZ(60px);
        }
        .workflow-angle-editor-v3 .angle-editor-face-bottom {
          transform: rotateX(-90deg) translateZ(60px);
        }
        .workflow-angle-editor-v3 .angle-editor-face-image-content {
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
          border-radius: 12px;
          display: block;
        }
        .workflow-angle-editor-v3 .angle-editor-scene-camera {
          pointer-events: none;
          transform-style: preserve-3d;
          opacity: 1;
          justify-content: center;
          align-items: center;
          transition: opacity 0.2s ease-out;
          display: flex;
          position: absolute;
          inset: 0;
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid {
          pointer-events: none;
          z-index: 1;
          opacity: 1;
          justify-content: center;
          align-items: center;
          transition: opacity 0.2s ease-out;
          display: flex;
          position: absolute;
          inset: 0;
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-inner {
          width: 150px;
          height: 150px;
          transform-style: preserve-3d;
          transition: transform 0.15s ease-out;
          position: relative;
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-meridian,
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-parallel {
          border: 1px solid var(--angle-sphere-line);
          transform-style: preserve-3d;
          border-radius: 50%;
          position: absolute;
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-meridian {
          width: 100%;
          height: 100%;
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-parallel {
          top: 50%;
          left: 50%;
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-helper-vertical {
          background: var(--angle-sphere-helper);
          width: 1px;
          height: 150px;
          transition: opacity 0.15s ease-out;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-helper-horizontals {
          width: 150px;
          height: 150px;
          transition: opacity 0.15s ease-out;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .workflow-angle-editor-v3 .angle-editor-sphere-grid-helper-horizontal {
          background: var(--angle-sphere-helper);
          height: 1px;
          position: absolute;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-pivot {
          transform-style: preserve-3d;
          transition: transform 0.15s ease-out;
          position: absolute;
          top: 50%;
          left: 50%;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-position {
          transform-style: preserve-3d;
          position: absolute;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-body {
          border-radius: 4px;
          position: absolute;
          transform: translate(-50%, -50%);
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-front {
          background-color: #1a1a1a;
          border: 1.5px solid #fff4;
          width: 24px;
          height: 18px;
          box-shadow: inset 0 0 4px #00000080;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-back {
          background-color: #252525;
          border: 1px solid #fff3;
          width: 24px;
          height: 18px;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-top,
        .workflow-angle-editor-v3 .angle-editor-camera-3d-bottom {
          background-color: #1f1f1f;
          border: 1px solid #fff3;
          width: 24px;
          height: 16px;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-bottom {
          background-color: #1a1a1a;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-side {
          background-color: #1c1c1c;
          border: 1px solid #fff3;
          width: 16px;
          height: 18px;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-lens-outer {
          background-color: #2a2a2a;
          border: 2px solid #fff6;
          border-radius: 50%;
          width: 14px;
          height: 14px;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 6px #fff4;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-lens-inner {
          background-color: #0a0a0a;
          border: 1px solid #fff;
          border-radius: 50%;
          width: 10px;
          height: 10px;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          box-shadow:
            inset 0 0 4px #fff,
            0 0 8px #fff8;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-indicator {
          background-color: #f44;
          border-radius: 50%;
          width: 4px;
          height: 4px;
          position: absolute;
          top: 3px;
          right: 3px;
          box-shadow: 0 0 2px red;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-screen {
          filter: brightness(0.7);
          transform-origin: 50%;
          width: 18px;
          height: 12px;
          transform-style: preserve-3d;
          background-color: #0f0f14;
          background-position: 50%;
          background-repeat: no-repeat;
          background-size: contain;
          border: 1px solid #282828;
          border-radius: 2px;
          position: absolute;
          top: 3px;
          left: 3px;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-shutter {
          background-color: #444;
          border: 1px solid #555;
          border-radius: 50%;
          width: 5px;
          height: 5px;
          position: absolute;
          top: 4px;
          right: 4px;
          box-shadow: inset 0 -1px 2px #00000080;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-hotshoe {
          transform-style: preserve-3d;
          position: absolute;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-hotshoe-body {
          background-color: #1a1a1a;
          border: 1px solid #fff3;
          border-radius: 4px 4px 0 0;
          width: 10px;
          height: 6px;
          position: absolute;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-hotshoe-mount {
          background-color: #0a0a0a;
          border: 1px solid #333;
          border-radius: 2px;
          width: 6px;
          height: 3px;
          position: absolute;
          bottom: 1px;
          left: 50%;
          transform: translate(-50%);
        }
        .workflow-angle-editor-v3 .angle-editor-camera-3d-line {
          opacity: 0.6;
          transform-origin: top;
          background-color: #fff;
          width: 2px;
          position: absolute;
          box-shadow: 0 0 3px #fff;
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn {
          width: 32px;
          height: 32px;
          color: var(--fg-muted);
          cursor: pointer;
          z-index: 10;
          background: transparent;
          border: none;
          border-radius: 8px;
          justify-content: center;
          align-items: center;
          padding: 0;
          transition: all 0.15s;
          display: flex;
          position: absolute;
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn:hover,
        .workflow-angle-editor-v3 .angle-editor-direction-btn:active {
          color: var(--fg-default);
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn:active svg {
          transform: scale(0.9);
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn svg {
          width: 20px;
          height: 20px;
          transition: transform 0.1s;
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn-up {
          top: 8px;
          left: 50%;
          transform: translate(-50%);
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn-down {
          bottom: 8px;
          left: 50%;
          transform: translate(-50%);
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn-left {
          top: 50%;
          left: 8px;
          transform: translateY(-50%);
        }
        .workflow-angle-editor-v3 .angle-editor-direction-btn-right {
          top: 50%;
          right: 8px;
          transform: translateY(-50%);
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-panel {
          opacity: 1;
          flex-direction: column;
          gap: 8px;
          transition: opacity 0.2s ease-out;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-settings {
          flex-direction: column;
          gap: 8px;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-setting-row {
          align-items: center;
          gap: 16px;
          height: 32px;
          padding: 0 8px;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-setting-label {
          width: 60px;
          color: var(--fg-muted);
          flex: 0 0 60px;
          font-size: 13px;
          font-weight: 400;
          line-height: 1.4;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-setting-slider {
          flex: 1;
          align-items: center;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-setting-range {
          -webkit-appearance: none;
          appearance: none;
          cursor: pointer;
          touch-action: none;
          border-radius: 999px;
          outline: none;
          width: 100%;
          height: 4px;
        }
        .workflow-angle-editor-v3
          .angle-editor-camera-mode-setting-range::-webkit-slider-runnable-track {
          border-radius: 999px;
          height: 4px;
        }
        .workflow-angle-editor-v3
          .angle-editor-camera-mode-setting-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          cursor: grab;
          background: #fff;
          border: 1.5px solid #f0f0f0;
          border-radius: 999px;
          width: 14px;
          height: 14px;
          margin-top: -5px;
        }
        .workflow-angle-editor-v3
          .angle-editor-camera-mode-setting-range::-webkit-slider-thumb:active {
          cursor: grabbing;
        }
        .workflow-angle-editor-v3
          .angle-editor-camera-mode-setting-range::-moz-range-track {
          border-radius: 999px;
          height: 4px;
        }
        .workflow-angle-editor-v3
          .angle-editor-camera-mode-setting-range::-moz-range-thumb {
          cursor: grab;
          background: #fff;
          border: 1.5px solid #f0f0f0;
          border-radius: 999px;
          width: 14px;
          height: 14px;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-setting-value {
          text-align: right;
          width: 36px;
          color: var(--fg-default);
          flex: 0 0 36px;
          font-size: 13px;
          font-weight: 400;
          line-height: 1.4;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-prompt-section {
          flex-direction: column;
          gap: 8px;
          padding: 0 8px;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-toggle-row {
          height: 32px;
          color: var(--fg-muted);
          align-items: center;
          justify-content: space-between;
          display: flex;
          font-size: 13px;
          line-height: 1.4;
        }
        .workflow-angle-editor-v3 .angle-editor-toggle-switch {
          width: 34px;
          height: 20px;
          cursor: pointer;
          background: #4a4a4a;
          border: none;
          border-radius: 999px;
          padding: 2px;
          transition: background 0.15s;
          display: flex;
          align-items: center;
        }
        .workflow-angle-editor-v3 .angle-editor-toggle-switch.active {
          background: var(--color-brand-400);
        }
        .workflow-angle-editor-v3 .angle-editor-toggle-thumb {
          width: 16px;
          height: 16px;
          background: #fff;
          border-radius: 999px;
          transition: transform 0.15s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }
        .workflow-angle-editor-v3
          .angle-editor-toggle-switch.active
          .angle-editor-toggle-thumb {
          transform: translateX(14px);
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-prompt-box {
          border: 0.5px solid var(--canvas-controls-border);
          background: transparent;
          border-radius: 10px;
          padding: 8px 12px;
        }
        .workflow-angle-editor-v3 .angle-editor-camera-mode-prompt-textarea {
          resize: none;
          width: 100%;
          color: var(--fg-default);
          background: transparent;
          border: none;
          outline: none;
          font-family: inherit;
          font-size: 13px;
          line-height: 1.6;
          display: block;
        }
        .workflow-angle-editor-v3
          .angle-editor-camera-mode-prompt-textarea::placeholder {
          color: var(--input-placeholder);
        }
        .workflow-angle-editor-v3 .angle-editor-v3-footer {
          align-items: center;
          gap: 12px;
          padding: 4px 8px 0;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-footer-spacer {
          flex: 1;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-reset-btn {
          color: var(--fg-muted);
          cursor: pointer;
          white-space: nowrap;
          background: transparent;
          border: none;
          border-radius: 8px;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 400;
          transition: all 0.15s;
          display: flex;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-reset-btn:hover {
          background: var(--canvas-controls-hover);
          color: var(--fg-default);
        }
        .workflow-angle-editor-v3 .angle-editor-v3-send {
          color: var(--fg-muted);
          display: flex;
          height: 32px;
          min-width: 64px;
          align-items: center;
          gap: 8px;
          align-self: flex-end;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-token {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          gap: 2px;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-token span {
          min-width: 13px;
          text-align: center;
          font-size: 12px;
          font-weight: 400;
          line-height: 15px;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-send-btn {
          background: var(--bg-btn-invert-bg);
          color: var(--btn-invert-text);
          display: flex;
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
          transition:
            filter 0.15s,
            opacity 0.15s;
        }
        .workflow-angle-editor-v3 .angle-editor-v3-send-btn:hover {
          filter: brightness(1.1);
        }
        .workflow-angle-editor-v3 .angle-editor-v3-send-btn:active {
          filter: brightness(0.95);
        }
        .workflow-angle-editor-v3 .angle-editor-v3-send-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
