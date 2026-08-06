"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Settings2 } from "lucide-react";
import { WorkflowExtraParametersPanel } from "./workflow-extra-parameters";
import {
  getWorkflowImageToolModelValue,
  useWorkflowImageToolSettings,
} from "./nodes/workflow-image-tool-settings";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { CANVAS_CONTROLS_MENU_PANEL_STYLE } from "./surface-contracts";
import {
  drawWorkflowRedrawPreview,
  getWorkflowImageContentFrame,
  getWorkflowRedrawPoint,
  useWorkflowImageNaturalSize,
} from "./workflow-media-utils";
import type {
  WorkflowRedrawChoice,
  WorkflowRedrawMenu,
  WorkflowRedrawMode,
  WorkflowRedrawOperation,
  WorkflowRedrawSubmitRequest,
  WorkflowRedrawTool,
} from "./surface-contracts";
import type { WorkflowImageFitMode } from "./workflow-media-utils";

export function WorkflowRedrawToolIcon({ tool }: { tool: WorkflowRedrawTool }) {
  if (tool === "rect") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="none"
        viewBox="0 0 16 16"
        className="h-4 w-4 opacity-60"
      >
        <path
          fill="currentColor"
          d="M2.133 10.999c.22 0 .4.18.4.4v1.213c0 .472.382.854.854.854H4.6c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H3.387a2.054 2.054 0 0 1-2.051-1.948l-.003-.106V11.4c0-.22.18-.4.4-.4zm7.134 2.467c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H6.733a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4zm5-2.467c.22 0 .4.18.4.4v1.213l-.003.106a2.054 2.054 0 0 1-1.945 1.945l-.106.003H11.4a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4h1.213a.854.854 0 0 0 .854-.854V11.4c0-.22.18-.4.4-.4zM2.133 6.332c.22 0 .4.18.4.4v2.534a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V6.732c0-.22.18-.4.4-.4zm12.134 0c.22 0 .4.18.4.4v2.534a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V6.732c0-.22.18-.4.4-.4zm-9.667-5c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H3.387a.854.854 0 0 0-.854.854v1.213a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V3.386c0-1.134.92-2.054 2.054-2.054zm8.119.003a2.054 2.054 0 0 1 1.948 2.05V4.6a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V3.386a.854.854 0 0 0-.854-.854H11.4a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4h1.213zm-3.452-.003c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H6.733a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4z"
        />
      </svg>
    );
  }
  if (tool === "eraser") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="none"
        viewBox="0 0 16 16"
        className="h-4 w-4 opacity-60"
      >
        <path
          fill="currentColor"
          d="M7.607 1.622c.84-.84 2.201-.84 3.041 0l3.383 3.382c.84.84.84 2.203 0 3.042l-5.934 5.935h6.936a.3.3 0 0 1 .3.3v.4a.3.3 0 0 1-.3.3H6.358a2.15 2.15 0 0 1-1.68-.624l-3.382-3.383a2.15 2.15 0 0 1-.077-2.96l.077-.08zM2.003 8.64a1.15 1.15 0 0 0 0 1.627l3.382 3.383c.205.205.469.315.737.333v-.002h.197c.253-.026.5-.136.694-.33l1.308-1.309-5.01-5.01zM9.94 2.33a1.15 1.15 0 0 0-1.627 0L4.018 6.626l5.01 5.01 4.297-4.297a1.15 1.15 0 0 0-.001-1.628z"
        />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      className="h-4 w-4 opacity-60"
    >
      <path
        fill="currentColor"
        d="M9.287 2.31a3.083 3.083 0 0 1 4.47-.144l.114.119a3.023 3.023 0 0 1-.28 4.333l-5.527 4.719a3.35 3.35 0 0 1-.985 2.086l-.132.117c-1.45 1.173-5.59 1.067-5.61 1.066-.001-.033-.213-4.497 1.094-5.794a3.4 3.4 0 0 1 1.954-.96zm-3.01 7.296c-.795-.788-2.135-.8-2.994.051-.102.1-.266.378-.413.92-.139.509-.226 1.115-.278 1.72-.033.389-.048.764-.056 1.093.319-.014.68-.038 1.053-.077.598-.062 1.199-.16 1.704-.305.537-.154.823-.321.934-.431.859-.852.846-2.182.05-2.97m6.628-6.595a1.87 1.87 0 0 0-2.713.087l-4.326 4.89c.463.152.898.409 1.264.773.341.338.588.735.745 1.158l4.928-4.207c.82-.7.866-1.943.102-2.701"
      />
    </svg>
  );
}

export function WorkflowRedrawArrowIcon({
  direction,
}: {
  direction: "back" | "forward";
}) {
  if (direction === "forward") {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 14l4 -4l-4 -4" />
        <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
      </svg>
    );
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14l-4 -4l4 -4" />
      <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
    </svg>
  );
}

export function WorkflowRedrawCurveIcon({ size: _size }: { size: number }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="h-4 w-4 shrink-0 text-neutral-400"
    >
      <path
        fill="currentColor"
        d="M8.631 1.304c.394-.142.802-.22 1.196-.168.409.054.774.245 1.058.583.334.397.374.874.273 1.32-.098.43-.335.875-.622 1.305-.576.863-1.473 1.834-2.324 2.763-.872.95-1.699 1.857-2.21 2.641-.257.393-.406.715-.458.963-.047.231-.004.354.073.443.093.108.191.149.345.14.184-.012.443-.1.78-.293.672-.385 1.462-1.076 2.285-1.844.799-.745 1.632-1.566 2.33-2.128.348-.28.7-.527 1.027-.668.288-.125.706-.23 1.078 0l.073.05.129.106c.286.256.46.57.519.926.064.388-.017.778-.149 1.136-.26.702-.794 1.463-1.283 2.153-.513.724-.985 1.384-1.235 1.964-.252.58-.197.872.004 1.07a.58.58 0 0 0 .38.187c.137.01.312-.025.532-.124.451-.203.946-.61 1.442-1.056l.348.387.348.386c-.49.44-1.093.953-1.71 1.232-.315.142-.668.239-1.035.212a1.62 1.62 0 0 1-1.037-.485c-.672-.665-.53-1.52-.227-2.222.304-.703.855-1.465 1.342-2.152.511-.722.953-1.366 1.156-1.913.098-.268.12-.464.097-.606a.54.54 0 0 0-.216-.344.6.6 0 0 0-.143.047q-.293.127-.789.524c-.658.53-1.435 1.299-2.272 2.08-.814.759-1.686 1.531-2.477 1.984-.394.227-.817.402-1.234.428a1.41 1.41 0 0 1-1.198-.5c-.34-.396-.395-.874-.301-1.329.09-.437.32-.887.604-1.322.569-.871 1.463-1.847 2.315-2.776.873-.952 1.704-1.857 2.226-2.638.262-.391.416-.711.473-.958.052-.23.01-.342-.054-.419a.6.6 0 0 0-.4-.221c-.172-.023-.405.006-.707.114-.612.22-1.365.712-2.199 1.382C5.116 5.005 3.326 6.88 1.911 8.206l-.711-.76c1.347-1.262 3.226-3.22 4.933-4.592.854-.687 1.717-1.27 2.498-1.55"
      />
    </svg>
  );
}

export function WorkflowRedrawSelectChevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M4 6.4L8 10.4L12 6.4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WorkflowRedrawAspectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="3"
        y="3"
        width="10"
        height="10"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function WorkflowRedrawGenerateIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="size-4"
    >
      <path
        d="M8.29289 0.292893C8.68342 -0.0976311 9.31658 -0.0976311 9.70711 0.292893L17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711C17.3166 10.0976 16.6834 10.0976 16.2929 9.70711L10 3.41421V17C10 17.5523 9.55229 18 9 18C8.44772 18 8 17.5523 8 17V3.41421L1.70711 9.70711C1.31658 10.0976 0.683418 10.0976 0.292893 9.70711C-0.0976311 9.31658 -0.0976311 8.68342 0.292893 8.29289L8.29289 0.292893Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WorkflowRedrawToolbarButton({
  active,
  disabled,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex select-none items-center justify-center rounded-lg text-[13px] text-canvas-controls-text transition-colors ${label ? "h-8 gap-1 px-3 py-2" : "h-8 w-8 min-w-8 gap-0 p-2"} ${active ? "bg-canvas-controls-active" : "bg-transparent hover:bg-canvas-controls-hover active:bg-canvas-controls-active"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick?.();
      }}
    >
      {children}
      {label ? (
        <span className="text-[13px] leading-[1.4]">{label}</span>
      ) : null}
    </button>
  );
}

export function WorkflowRedrawOptionButton({
  disabled,
  children,
  open,
  onClick,
}: {
  disabled?: boolean;
  children: React.ReactNode;
  open?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex h-8 items-center justify-center gap-1 rounded-lg py-1 pl-3 pr-2 text-[13px] leading-normal transition-colors ${open ? "bg-white/[0.10]" : "bg-transparent hover:bg-white/[0.08]"} ${disabled ? "cursor-not-allowed text-neutral-600" : "cursor-pointer text-white/82"}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick?.();
      }}
    >
      {children}
      <WorkflowRedrawSelectChevron />
    </button>
  );
}

export function WorkflowRedrawDropdown({
  open,
  options,
  value,
  onSelect,
}: {
  open: boolean;
  options: WorkflowRedrawChoice[];
  value: string;
  onSelect: (value: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="absolute bottom-full left-0 z-[1010] mb-1.5 max-h-80 min-w-full max-w-[280px] overflow-y-auto rounded-lg p-1 text-canvas-controls-text"
      style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`flex h-7 w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-2.5 text-left text-[12px] transition-colors ${option.value === value ? "bg-canvas-controls-hover text-canvas-controls-text" : "text-canvas-controls-text opacity-70 hover:bg-canvas-controls-hover hover:opacity-100"}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(option.value);
          }}
        >
          <span className="max-w-56 truncate" title={option.label}>
            {option.label}
          </span>
          {option.value === value ? (
            <Check className="size-3.5 opacity-80" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function WorkflowRedrawLegacyStrokeIcon({ size }: { size: number }) {
  const strokeWidth = Math.max(1.2, Math.min(5, size * 0.12));
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="h-4 w-4 text-neutral-400"
    >
      <path
        d="M4 12 C8 6, 14 20, 20 12"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WorkflowImageRedrawOverlay({
  imageUrl,
  title,
  nodeWidth,
  nodeHeight,
  fitMode,
  modelId,
  mode,
  onClose,
  onSubmit,
}: {
  imageUrl: string;
  title: string;
  nodeWidth: number;
  nodeHeight: number;
  fitMode: WorkflowImageFitMode;
  modelId?: string;
  mode: WorkflowRedrawMode;
  onClose: () => void;
  onSubmit: (request: WorkflowRedrawSubmitRequest) => void;
}) {
  const nodeBounds = useMemo(
    () => ({ width: Math.max(1, nodeWidth), height: Math.max(1, nodeHeight) }),
    [nodeHeight, nodeWidth],
  );
  const naturalSize = useWorkflowImageNaturalSize(imageUrl);
  const contentFrame = useMemo(
    () => getWorkflowImageContentFrame(nodeBounds, naturalSize, fitMode),
    [fitMode, naturalSize, nodeBounds],
  );
  const bounds = useMemo(
    () => ({
      width: Math.max(1, contentFrame.width),
      height: Math.max(1, contentFrame.height),
    }),
    [contentFrame.height, contentFrame.width],
  );
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const [tool, setTool] = useState<WorkflowRedrawTool>("brush");
  const [brushSize, setBrushSize] = useState(30);
  const [operations, setOperations] = useState<WorkflowRedrawOperation[]>([]);
  const [redoStack, setRedoStack] = useState<WorkflowRedrawOperation[]>([]);
  const [activeOperation, setActiveOperation] =
    useState<WorkflowRedrawOperation | null>(null);
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeMenu, setActiveMenu] = useState<WorkflowRedrawMenu>(null);
  const imageSettings = useWorkflowImageToolSettings({
    initialModelId: modelId,
    requireMask: true,
  });
  const aspectOptions = imageSettings.aspectOptions;
  const aspectRatio = imageSettings.aspectRatio;
  const setAspectRatio = imageSettings.setAspectRatio;
  const sizeOptions = imageSettings.resolutionOptions;
  const size = imageSettings.resolution;
  const setSize = imageSettings.setResolution;
  const countOptions = imageSettings.countOptions;
  const count = imageSettings.count;
  const setCount = imageSettings.setCount;
  const isEraseMode = mode === "erase";
  const defaultErasePrompt =
    "擦除标记区域，并根据周围背景自然补全，保持原图风格、光照、材质和透视一致，不要新增无关元素。";
  const oldCanvasVars = {
    "--canvas-controls-border": "rgba(255,255,255,0.12)",
    "--canvas-controls-hover": "rgba(255,255,255,0.08)",
    "--canvas-controls-active": "rgba(255,255,255,0.10)",
  } as React.CSSProperties;
  const modelOptions = useMemo<WorkflowRedrawChoice[]>(
    () =>
      imageSettings.models.map((model) => ({
        value: getWorkflowImageToolModelValue(model),
        label: model.name,
      })),
    [imageSettings.models],
  );
  const selectedModelLabel =
    imageSettings.selectedModel?.name ||
    (imageSettings.modelsLoading ? "加载模型..." : "选择模型");
  const selectedAspectLabel =
    imageSettings.aspectOptions.find(
      (item) => item.value === imageSettings.aspectRatio,
    )?.label || imageSettings.aspectRatio;
  const selectedSizeLabel =
    imageSettings.resolutionOptions.find(
      (item) => item.value === imageSettings.resolution,
    )?.label || imageSettings.resolution;
  const selectedQualityLabel =
    imageSettings.qualityOptions.find(
      (item) => item.value === imageSettings.quality,
    )?.label || imageSettings.quality;
  const selectedCountLabel =
    imageSettings.countOptions.find(
      (item) => item.value === imageSettings.count,
    )?.label || `${imageSettings.count || 1}张`;
  const selectedCount = Math.max(
    1,
    Number.parseInt(imageSettings.count || "1", 10) || 1,
  );
  const hasAdvancedParameters =
    imageSettings.supportsWebSearch ||
    imageSettings.advancedDefinitions.length > 0;

  const paintOperations = useCallback(
    (
      nextOperations: WorkflowRedrawOperation[],
      active: WorkflowRedrawOperation | null = null,
    ) => {
      const canvas = maskCanvasRef.current;
      if (!canvas) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const displayWidth = bounds.width;
      const displayHeight = bounds.height;
      const width = Math.max(1, Math.round(displayWidth * ratio));
      const height = Math.max(1, Math.round(displayHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
      }
      drawWorkflowRedrawPreview(
        canvas,
        active ? [...nextOperations, active] : nextOperations,
        bounds,
        {
          scaleX: (displayWidth / bounds.width) * ratio,
          scaleY: (displayHeight / bounds.height) * ratio,
        },
      );
    },
    [bounds],
  );

  useEffect(() => {
    paintOperations(operations, activeOperation);
  }, [activeOperation, operations, paintOperations]);

  useEffect(() => {
    const handlePointerDown = () => setActiveMenu(null);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          setRedoStack((current) => {
            const [next, ...rest] = current;
            if (!next) return current;
            setOperations((items) => [...items, next]);
            return rest;
          });
        } else {
          setOperations((current) => {
            const next = current.slice(0, -1);
            const removed = current[current.length - 1];
            if (removed) setRedoStack((items) => [removed, ...items]);
            return next;
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const commitOperation = useCallback(
    (operation: WorkflowRedrawOperation | null) => {
      if (!operation) return;
      if (
        operation.tool === "rect" &&
        (operation.rect.width < 2 || operation.rect.height < 2)
      )
        return;
      if (operation.tool !== "rect" && operation.points.length === 0) return;
      setOperations((current) => [...current, operation]);
      setRedoStack([]);
      setActiveOperation(null);
      setErrorMessage("");
    },
    [],
  );

  const startDraw = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const point = getWorkflowRedrawPoint(event, bounds);
      event.currentTarget.setPointerCapture(event.pointerId);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (tool === "rect") {
        setActiveOperation({
          id,
          tool: "rect",
          start: point,
          rect: { x: point.x, y: point.y, width: 1, height: 1 },
        });
      } else {
        setActiveOperation({ id, tool, size: brushSize, points: [point] });
      }
    },
    [bounds, brushSize, tool],
  );

  const moveDraw = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activeOperation) return;
      event.preventDefault();
      event.stopPropagation();
      const point = getWorkflowRedrawPoint(event, bounds);
      setActiveOperation((current) => {
        if (!current) return null;
        if (current.tool === "rect") {
          const x = Math.min(current.start.x, point.x);
          const y = Math.min(current.start.y, point.y);
          return {
            ...current,
            rect: {
              x,
              y,
              width: Math.max(1, Math.abs(point.x - current.start.x)),
              height: Math.max(1, Math.abs(point.y - current.start.y)),
            },
          };
        }
        return { ...current, points: [...current.points, point] };
      });
    },
    [activeOperation, bounds],
  );

  const endDraw = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setActiveOperation((current) => {
        commitOperation(current);
        return null;
      });
    },
    [commitOperation],
  );

  const undo = useCallback(() => {
    setOperations((current) => {
      const next = current.slice(0, -1);
      const removed = current[current.length - 1];
      if (removed) setRedoStack((items) => [removed, ...items]);
      return next;
    });
    setActiveOperation(null);
  }, []);

  const redo = useCallback(() => {
    setRedoStack((current) => {
      const [nextOperation, ...rest] = current;
      if (!nextOperation) return current;
      setOperations((items) => [...items, nextOperation]);
      return rest;
    });
  }, []);

  useEffect(() => {
    setReferenceImages((current) =>
      current.slice(0, imageSettings.maxReferenceImages),
    );
  }, [imageSettings.maxReferenceImages]);

  const handleReferenceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []).filter((file) =>
        file.type.startsWith("image/"),
      );
      event.target.value = "";
      if (files.length === 0) return;
      void Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ""));
              reader.onerror = () =>
                reject(reader.error || new Error("读取参考图失败"));
              reader.readAsDataURL(file);
            }),
        ),
      )
        .then((items) => {
          setReferenceImages((current) =>
            [...current, ...items].slice(0, imageSettings.maxReferenceImages),
          );
        })
        .catch((error) => {
          setErrorMessage(
            error instanceof Error ? error.message : "读取参考图失败",
          );
        });
    },
    [imageSettings.maxReferenceImages],
  );

  const run = useCallback(async () => {
    const promptText = isEraseMode ? defaultErasePrompt : prompt.trim();
    if (isRunning || !promptText || operations.length === 0) return;
    setIsRunning(true);
    setErrorMessage("");
    onSubmit({
      mode,
      prompt: promptText,
      operations,
      displaySize: bounds,
      modelId: imageSettings.modelId,
      workflowEndpointMethod: imageSettings.methodId || undefined,
      referenceImages,
      aspectRatio: aspectRatio || undefined,
      size: size || undefined,
      count: countOptions.length > 0 ? selectedCount : undefined,
      enableWebSearch: imageSettings.enableWebSearch,
      workflowExtraParameters:
        Object.keys(imageSettings.extraParameters).length > 0
          ? imageSettings.extraParameters
          : undefined,
    });
  }, [
    aspectRatio,
    bounds,
    countOptions.length,
    defaultErasePrompt,
    imageSettings.enableWebSearch,
    imageSettings.extraParameters,
    imageSettings.methodId,
    imageSettings.modelId,
    isEraseMode,
    isRunning,
    mode,
    onSubmit,
    operations,
    prompt,
    referenceImages,
    selectedCount,
    size,
  ]);

  const canGenerate =
    (isEraseMode || prompt.trim().length > 0) &&
    operations.length > 0 &&
    Boolean(imageSettings.selectedModel && imageSettings.route) &&
    !isRunning;
  const toolItems: Array<{ value: WorkflowRedrawTool; label: string }> = [
    { value: "brush", label: "画笔" },
    { value: "rect", label: "框选" },
    { value: "eraser", label: "橡皮擦" },
  ];

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute left-0 top-0 z-[85] flex flex-col items-center overflow-visible"
      style={{ width: nodeBounds.width, height: nodeBounds.height }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="absolute left-1/2 top-0 z-[1001] w-max -translate-x-1/2"
        style={oldCanvasVars}
      >
        <div className="relative overflow-visible">
          <div className="[&>*:first-child]:absolute [&>*:first-child]:bottom-full [&>*:first-child]:left-1/2 [&>*:first-child]:mb-2.5 [&>*:first-child]:w-max [&>*:first-child]:-translate-x-1/2 [&>*:not(:first-child)]:!mt-0">
            <div className="flex w-fit items-center gap-2 rounded-xl border border-white/[0.12] bg-[#202024]/95 p-2 text-white shadow-md backdrop-blur">
              <WorkflowRedrawToolbarButton
                label={isEraseMode ? "擦除" : "重绘"}
                onClick={onClose}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  fill="none"
                  viewBox="0 0 14 14"
                  className="h-4 w-4 shrink-0 opacity-60"
                >
                  <path
                    fill="currentColor"
                    d="M5.08.824a.41.41 0 0 1-.412.411H2.08a.845.845 0 0 0-.845.845v9.569c0 .466.379.845.845.845h2.588c.228 0 .412.184.412.412v.411a.41.41 0 0 1-.412.412H2.08a2.08 2.08 0 0 1-2.077-1.973L0 11.65V2.08A2.08 2.08 0 0 1 2.08 0h2.588c.228 0 .412.184.412.412z"
                  />
                  <path
                    fill="currentColor"
                    d="M13.82 6.428a.62.62 0 0 1 0 .873l-4.564 4.563a.41.41 0 0 1-.582 0l-.292-.291a.41.41 0 0 1 0-.583l3.508-3.507H4.565a.41.41 0 0 1-.411-.412v-.413c0-.227.184-.412.411-.412h7.325L8.382 2.74a.41.41 0 0 1 0-.583l.292-.291c.16-.161.421-.161.582 0z"
                  />
                </svg>
              </WorkflowRedrawToolbarButton>
              <div className="h-6 w-px shrink-0 bg-white/[0.12]" />
              {toolItems.map((item) => (
                <WorkflowRedrawToolbarButton
                  key={item.value}
                  active={tool === item.value}
                  onClick={() => setTool(item.value)}
                >
                  <WorkflowRedrawToolIcon tool={item.value} />
                </WorkflowRedrawToolbarButton>
              ))}
              <div className="h-6 w-px shrink-0 bg-white/[0.12]" />
              <div className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border-0 bg-transparent px-3 py-2 text-neutral-400">
                <WorkflowRedrawCurveIcon size={brushSize} />
                <div className="relative flex h-3 w-16 shrink-0 items-center">
                  <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-neutral-600" />
                  <div
                    className="pointer-events-none absolute left-0 h-1 rounded-full bg-[#60a5fa]"
                    style={{ width: `${((brushSize - 2) / 78) * 64}px` }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 h-3 w-3 rounded-full border border-neutral-100 bg-white"
                    style={{ left: `${((brushSize - 2) / 78) * 52}px` }}
                  />
                  <input
                    aria-label="画笔大小"
                    min={2}
                    max={80}
                    step={1}
                    className="absolute inset-0 h-3 w-full cursor-pointer appearance-none bg-transparent opacity-0"
                    type="range"
                    value={brushSize}
                    onChange={(event) =>
                      setBrushSize(Number(event.target.value))
                    }
                  />
                </div>
              </div>
              <div className="h-6 w-px shrink-0 bg-white/[0.12]" />
              <WorkflowRedrawToolbarButton
                disabled={operations.length === 0}
                onClick={undo}
              >
                <WorkflowRedrawArrowIcon direction="back" />
              </WorkflowRedrawToolbarButton>
              <WorkflowRedrawToolbarButton
                disabled={redoStack.length === 0}
                onClick={redo}
              >
                <WorkflowRedrawArrowIcon direction="forward" />
              </WorkflowRedrawToolbarButton>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        <div
          className="absolute cursor-crosshair touch-none select-none"
          style={{
            left: contentFrame.left,
            top: contentFrame.top,
            width: contentFrame.width,
            height: contentFrame.height,
          }}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
        >
          <canvas
            ref={maskCanvasRef}
            className="pointer-events-none block h-full w-full bg-black/5"
          />
        </div>
      </div>
      <div
        className="absolute left-1/2 top-full z-[1001] mt-3 w-max min-w-[420px] max-w-[min(760px,calc(100vw-24px))] -translate-x-1/2"
        style={oldCanvasVars}
      >
        <div className="w-full rounded-xl border border-white/[0.12] bg-[#202024]/95 p-2 text-white shadow-md backdrop-blur">
          {!isEraseMode ? (
            <div className="rounded-xl bg-[#202024] p-1">
              <textarea
                placeholder="开始你的设计"
                rows={2}
                className="w-full resize-none rounded-lg bg-transparent px-2 py-1 text-[14px] leading-[1.8] text-white outline-none placeholder:text-white/50"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
          ) : null}
          <div
            className={`${isEraseMode ? "mt-0" : "mt-2"} flex items-center justify-between gap-2`}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <input
                ref={referenceInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleReferenceChange}
              />
              <div className="relative">
                <WorkflowRedrawDropdown
                  open={activeMenu === "model"}
                  options={modelOptions}
                  value={imageSettings.modelId}
                  onSelect={(value) => {
                    imageSettings.setModelId(value);
                    setActiveMenu(null);
                  }}
                />
                <WorkflowRedrawOptionButton
                  disabled={
                    imageSettings.modelsLoading && modelOptions.length === 0
                  }
                  open={activeMenu === "model"}
                  onClick={() =>
                    setActiveMenu((current) =>
                      current === "model" ? null : "model",
                    )
                  }
                >
                  <span
                    className="max-w-32 truncate whitespace-nowrap"
                    title={selectedModelLabel}
                  >
                    {selectedModelLabel}
                  </span>
                </WorkflowRedrawOptionButton>
              </div>
              {aspectOptions.length > 0 ? (
                <div className="relative">
                  <WorkflowRedrawDropdown
                    open={activeMenu === "aspect"}
                    options={aspectOptions}
                    value={aspectRatio}
                    onSelect={(value) => {
                      setAspectRatio(value);
                      setActiveMenu(null);
                    }}
                  />
                  <WorkflowRedrawOptionButton
                    open={activeMenu === "aspect"}
                    onClick={() =>
                      setActiveMenu((current) =>
                        current === "aspect" ? null : "aspect",
                      )
                    }
                  >
                    <span className="shrink-0">
                      <WorkflowRedrawAspectIcon />
                    </span>
                    <span className="whitespace-nowrap">
                      {selectedAspectLabel}
                    </span>
                  </WorkflowRedrawOptionButton>
                </div>
              ) : null}
              {sizeOptions.length > 0 ? (
                <div className="relative">
                  <WorkflowRedrawDropdown
                    open={activeMenu === "size"}
                    options={sizeOptions}
                    value={size}
                    onSelect={(value) => {
                      setSize(value);
                      setActiveMenu(null);
                    }}
                  />
                  <WorkflowRedrawOptionButton
                    open={activeMenu === "size"}
                    onClick={() =>
                      setActiveMenu((current) =>
                        current === "size" ? null : "size",
                      )
                    }
                  >
                    <span className="whitespace-nowrap">
                      {selectedSizeLabel}
                    </span>
                  </WorkflowRedrawOptionButton>
                </div>
              ) : null}
              {imageSettings.qualityOptions.length > 0 ? (
                <div className="relative">
                  <WorkflowRedrawDropdown
                    open={activeMenu === "quality"}
                    options={imageSettings.qualityOptions}
                    value={imageSettings.quality}
                    onSelect={(value) => {
                      imageSettings.setQuality(value);
                      setActiveMenu(null);
                    }}
                  />
                  <WorkflowRedrawOptionButton
                    open={activeMenu === "quality"}
                    onClick={() =>
                      setActiveMenu((current) =>
                        current === "quality" ? null : "quality",
                      )
                    }
                  >
                    <span className="whitespace-nowrap">
                      {selectedQualityLabel}
                    </span>
                  </WorkflowRedrawOptionButton>
                </div>
              ) : null}
              {countOptions.length > 0 ? (
                <div className="relative">
                  <WorkflowRedrawDropdown
                    open={activeMenu === "count"}
                    options={countOptions}
                    value={count}
                    onSelect={(value) => {
                      setCount(value);
                      setActiveMenu(null);
                    }}
                  />
                  <WorkflowRedrawOptionButton
                    open={activeMenu === "count"}
                    onClick={() =>
                      setActiveMenu((current) =>
                        current === "count" ? null : "count",
                      )
                    }
                  >
                    <span className="whitespace-nowrap">
                      {selectedCountLabel}
                    </span>
                  </WorkflowRedrawOptionButton>
                </div>
              ) : null}
              {imageSettings.maxReferenceImages > 0 ? (
                <button
                  type="button"
                  className="flex h-8 items-center justify-center rounded-lg bg-transparent px-2 text-[13px] text-white/62 transition-colors hover:bg-white/[0.08]"
                  title={`添加参考图，最多 ${imageSettings.maxReferenceImages} 张`}
                  onClick={() => referenceInputRef.current?.click()}
                >
                  {referenceImages.length > 0
                    ? `${referenceImages.length}图`
                    : "参考图"}
                </button>
              ) : null}
              {hasAdvancedParameters ? (
                <div className="relative">
                  <button
                    type="button"
                    className={`flex size-8 items-center justify-center rounded-lg text-white/62 transition-colors hover:bg-white/[0.08] hover:text-white ${activeMenu === "advanced" ? "bg-white/[0.10] text-white" : ""}`}
                    aria-label="更多参数"
                    aria-expanded={activeMenu === "advanced"}
                    onClick={() =>
                      setActiveMenu((current) =>
                        current === "advanced" ? null : "advanced",
                      )
                    }
                  >
                    <Settings2 className="size-4" />
                  </button>
                  {activeMenu === "advanced" ? (
                    <div
                      className="absolute bottom-[calc(100%+8px)] left-1/2 z-[1020] w-[360px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl border border-white/[0.10] bg-[#252529] p-3 text-sm text-white/82 shadow-[0_12px_32px_rgba(0,0,0,0.42)]"
                      onPointerDown={stopWorkflowNodeChromeEvent}
                      onClick={stopWorkflowNodeChromeEvent}
                    >
                      {imageSettings.supportsWebSearch ? (
                        <div className="flex items-center justify-between pb-2">
                          <span>联网搜索</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={
                              imageSettings.enableWebSearch === true
                            }
                            className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${imageSettings.enableWebSearch ? "bg-white" : "bg-white/[0.14]"}`}
                            onClick={() =>
                              imageSettings.setEnableWebSearch(
                                !imageSettings.enableWebSearch,
                              )
                            }
                          >
                            <span
                              className={`block size-4 rounded-full transition-transform ${imageSettings.enableWebSearch ? "translate-x-4 bg-black" : "translate-x-0.5 bg-white/60"}`}
                            />
                          </button>
                        </div>
                      ) : null}
                      {imageSettings.advancedDefinitions.length > 0 ? (
                        <WorkflowExtraParametersPanel
                          definitions={imageSettings.advancedDefinitions}
                          values={imageSettings.extraParameters}
                          context={{
                            modelId: imageSettings.modelId,
                            prompt,
                            referenceImageCount: referenceImages.length + 1,
                          }}
                          onChange={(patch) =>
                            imageSettings.setExtraParameters((current) => ({
                              ...current,
                              ...patch,
                            }))
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex h-8 min-w-16 items-center gap-2 text-white/52">
              <button
                type="button"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white text-black shadow-sm transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`生成${title ? ` ${title}` : ""}重绘`}
                data-testid="canvas-node-generate-btn"
                disabled={!canGenerate}
                onClick={run}
              >
                {isRunning ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-black/25 border-t-black" />
                ) : (
                  <WorkflowRedrawGenerateIcon />
                )}
              </button>
            </div>
          </div>
          {errorMessage || imageSettings.modelsError ? (
            <div className="mt-1 px-2 text-xs text-red-300">
              {errorMessage || imageSettings.modelsError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
