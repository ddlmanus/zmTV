"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ArrowUp, RefreshCw, X } from "lucide-react";
import {
  RELIGHT_BRIGHTNESS_MAX,
  RELIGHT_BRIGHTNESS_MIN,
  RELIGHT_DEFAULT_CONTROLS,
  RELIGHT_RUN_CREDITS,
  RELIGHT_TEMPERATURE_MAX,
  RELIGHT_TEMPERATURE_MIN,
  clampRelightValue,
  runRelightGeneration,
  type RelightControls,
  type RelightDirection,
  type RelightViewMode,
} from "@/workflow/ideart/components/editor/relight-edit-utils";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { getWorkflowImageRenderUrl } from "./workflow-media-utils";
import {
  HelpCircleMiniIcon,
  SparklesTokenIcon,
  SunMiniIcon,
  TemperatureMiniIcon,
} from "./workflow-icons";

export function WorkflowRelightPreview({
  imageUrl,
  controls,
  onLightPositionChange,
}: {
  imageUrl: string;
  controls: RelightControls;
  onLightPositionChange: (position: RelightControls["lightPosition"]) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef(controls);
  const onLightPositionChangeRef = useRef(onLightPositionChange);
  const renderUrl = getWorkflowImageRenderUrl(imageUrl);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    onLightPositionChangeRef.current = onLightPositionChange;
  }, [onLightPositionChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(256, 256);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.dataset.engine = "three.js r182";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "256px";
    renderer.domElement.style.height = "256px";
    host.appendChild(renderer.domElement);

    const radius = 5.8;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 96, 48),
      new THREE.MeshBasicMaterial({
        color: 0x3f3f3f,
        transparent: true,
        opacity: 0.72,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    scene.add(shell);

    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
    });
    for (const elevation of [-60, -30, 0, 30, 60]) {
      const points: THREE.Vector3[] = [];
      const phi = THREE.MathUtils.degToRad(90 - elevation);
      const y = radius * Math.cos(phi);
      const r = radius * Math.sin(phi);
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        points.push(
          new THREE.Vector3(r * Math.sin(theta), y, r * Math.cos(theta)),
        );
      }
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          gridMaterial.clone(),
        ),
      );
    }
    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const points: THREE.Vector3[] = [];
      const theta = THREE.MathUtils.degToRad(azimuth);
      for (let i = 0; i <= 96; i += 1) {
        const phi = THREE.MathUtils.degToRad(-90 + (i / 96) * 180);
        points.push(
          new THREE.Vector3(
            radius * Math.cos(phi) * Math.sin(theta),
            radius * Math.sin(phi),
            radius * Math.cos(phi) * Math.cos(theta),
          ),
        );
      }
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          gridMaterial.clone(),
        ),
      );
    }

    const targetMaterial = new THREE.MeshStandardMaterial({
      color: 0x777777,
      roughness: 0.72,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const targetMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 0.2),
      targetMaterial,
    );
    targetMesh.castShadow = true;
    targetMesh.receiveShadow = true;
    scene.add(targetMesh);

    const ambient = new THREE.AmbientLight(0xffffff, 0.58);
    scene.add(ambient);

    const lightGroup = new THREE.Group();
    const pointLight = new THREE.PointLight(0xf3f9fc, 6, 0);
    lightGroup.add(pointLight);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xf3f9fc }),
    );
    lightGroup.add(bulb);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, radius, 64, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xf3f9fc,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = radius / 2;
    lightGroup.add(cone);
    scene.add(lightGroup);

    const rimGroup = new THREE.Group();
    const rimBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0xa6a196,
        transparent: true,
        opacity: 0.75,
      }),
    );
    rimGroup.add(rimBulb);
    const rimPointLight = new THREE.PointLight(0xa6a196, 2.2, 0);
    rimGroup.add(rimPointLight);
    scene.add(rimGroup);

    const setLightPosition = (position: RelightControls["lightPosition"]) => {
      const vector = new THREE.Vector3(position.x, position.y, position.z);
      if (vector.lengthSq() < 0.01) vector.set(0, 0, 1);
      vector.normalize().multiplyScalar(radius);
      lightGroup.position.copy(vector);
      lightGroup.lookAt(0, 0, 0);
    };
    const setRimPosition = () => {
      const vector = new THREE.Vector3(0, 0, -radius);
      rimGroup.position.copy(vector);
      rimGroup.lookAt(0, 0, 0);
    };
    setRimPosition();

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");
    let loadedTexture: THREE.Texture | null = null;
    if (renderUrl) {
      textureLoader.load(renderUrl, (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture = texture;
        targetMaterial.map = texture;
        targetMaterial.color.set(0xffffff);
        targetMaterial.needsUpdate = true;
        const image = texture.image as
          | HTMLImageElement
          | HTMLCanvasElement
          | undefined;
        const ratio =
          image?.width && image?.height ? image.width / image.height : 1;
        if (ratio > 1) targetMesh.scale.set(1, 1 / ratio, 1);
        else targetMesh.scale.set(ratio, 1, 1);
      });
    }

    let animationId = 0;
    const animate = () => {
      if (disposed) return;
      animationId = requestAnimationFrame(animate);
      const current = controlsRef.current;
      const warmRatio = clampRelightValue(
        (current.colorTemperature - RELIGHT_TEMPERATURE_MIN) /
          (RELIGHT_TEMPERATURE_MAX - RELIGHT_TEMPERATURE_MIN),
        0,
        1,
      );
      const lightColor = new THREE.Color(warmRatio < 0.5 ? 0xffdaa4 : 0xdeeeff);
      const intensity =
        current.brightness <= 10
          ? 0.35
          : current.brightness >= 100
            ? 2.2
            : current.brightness / 50;
      pointLight.color.copy(lightColor);
      pointLight.intensity = 6 * intensity;
      (bulb.material as THREE.MeshBasicMaterial).color.copy(lightColor);
      (cone.material as THREE.MeshBasicMaterial).color.copy(lightColor);
      (cone.material as THREE.MeshBasicMaterial).opacity = 0.34 * intensity;
      rimGroup.visible = Boolean(current.rimLight);
      setLightPosition(current.lightPosition);
      if (current.viewMode === "front") {
        camera.position.lerp(new THREE.Vector3(0, 1, 15), 0.12);
      } else {
        camera.position.lerp(new THREE.Vector3(11, 8, 10), 0.12);
      }
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      loadedTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
      });
    };
  }, [renderUrl]);

  const updateFromPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      const x = clampRelightValue(
        ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        -1,
        1,
      );
      const y = clampRelightValue(
        (0.5 - (event.clientY - rect.top) / rect.height) * 2,
        -1,
        1,
      );
      const z =
        controlsRef.current.viewMode === "front"
          ? 1
          : Number(
              clampRelightValue(
                Math.sqrt(Math.max(0, 1 - x * x - y * y)),
                -1,
                1,
              ).toFixed(2),
            );
      onLightPositionChangeRef.current({
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z,
      });
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className="relative block h-64 w-64 cursor-crosshair touch-none"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        updateFromPointer(event);
      }}
    />
  );
}

export function WorkflowRelightSegmentSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  icon,
  temperature,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  icon: React.ReactNode;
  temperature?: boolean;
  onChange: (value: number) => void;
}) {
  const percent = clampRelightValue(
    ((value - min) / (max - min)) * 100,
    0,
    100,
  );
  const segments = temperature ? 6 : 3;
  const activeIndex = Math.min(
    segments - 1,
    Math.max(0, Math.floor((percent / 100) * segments)),
  );
  const dotColors = temperature
    ? ["#d7995d", "#d5ae55", "#f3db90", "#f3f9fc", "#d4e6ee", "#c4e2f0"]
    : ["#cccccc", "#cccccc", "#cccccc"];

  return (
    <div>
      <span className="mb-0.5 block text-sm font-semibold text-white/[0.48]">
        {label}
      </span>
      <div className="flex items-center justify-between">
        <div className="relative h-[22px] w-[132px] cursor-pointer select-none touch-none">
          <div
            className="pointer-events-none absolute left-0 top-1.5 h-2.5 w-[132px] overflow-hidden p-0.5"
            style={{
              borderRadius: temperature ? 16 : 18,
              background: temperature
                ? "rgba(173,176,178,0.1)"
                : "rgba(255,255,255,0.09)",
              backdropFilter: "blur(19px)",
            }}
          >
            {temperature ? (
              <div
                className="absolute inset-[2px] rounded-[14px]"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(238,130,36,0.3) 0%, rgba(242,154,37,0.3) 20%, rgba(249,218,125,0.3) 41%, rgba(247,249,242,0.3) 63%, rgba(220,239,247,0.3) 81%, rgba(182,224,242,0.3) 99%)",
                }}
              />
            ) : null}
            <div className="relative flex h-full w-full">
              {Array.from({ length: segments }).map((_, index) => (
                <div
                  key={index}
                  className="flex-1 rounded-lg transition-colors duration-200"
                  style={{
                    background:
                      index === activeIndex
                        ? temperature
                          ? "rgb(243,249,252)"
                          : "rgb(204,204,204)"
                        : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
          {Array.from({ length: segments }).map((_, index) => (
            <div
              key={index}
              className="pointer-events-none absolute top-[18px] size-0.5 rounded-full transition-opacity duration-200"
              style={{
                left: temperature ? 10 + index * 22 : 21 + index * 44,
                background: dotColors[index],
                opacity: index === activeIndex ? 0.7 : 0.2,
              }}
            />
          ))}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none p-0 opacity-0"
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </div>
        <div className="flex h-6 w-[84px] shrink-0 cursor-ew-resize select-none items-center rounded-sm bg-input/30">
          <div className="pointer-events-none flex flex-1 items-center justify-between pl-3 pr-2">
            <div className="flex size-[14px] shrink-0 items-center justify-center text-white">
              {icon}
            </div>
            <span className="text-sm font-medium leading-5 text-white">
              {Math.round(value)}
            </span>
            <span className="text-sm font-semibold leading-5 text-white/[0.34]">
              {unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowRelightPanel({
  imageUrl,
  title,
  modelId,
  projectId,
  onClose,
  onComplete,
}: {
  imageUrl: string;
  title: string;
  modelId?: string;
  projectId?: string;
  onClose: () => void;
  onComplete: (imageUrl: string, prompt: string) => void;
}) {
  const [controls, setControls] = useState<RelightControls>(
    RELIGHT_DEFAULT_CONTROLS,
  );
  const [isRunning, setIsRunning] = useState(false);
  const updateControl = useCallback(
    <K extends keyof RelightControls>(key: K, value: RelightControls[K]) => {
      setControls((current) => ({ ...current, [key]: value }));
    },
    [],
  );
  const setDirection = useCallback((direction: RelightDirection) => {
    const positionByDirection: Record<
      RelightDirection,
      RelightControls["lightPosition"]
    > = {
      left: { x: -0.82, y: 0.08, z: 0.35 },
      top: { x: 0, y: 0.86, z: 0.35 },
      right: { x: 0.82, y: 0.08, z: 0.35 },
      front: { x: 0, y: 0, z: 1 },
      bottom: { x: 0, y: -0.82, z: 0.25 },
      back: { x: 0, y: 0.08, z: -0.85 },
    };
    setControls((current) => ({
      ...current,
      mainLightDirection: direction,
      lightPosition: positionByDirection[direction],
    }));
  }, []);

  const run = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const result = await runRelightGeneration({
        imageUrl,
        modelId,
        controls,
        projectId,
      });
      onComplete(result.imageUrl, result.prompt);
      onClose();
    } catch (error) {
      console.error("[Workflow relight] failed", error);
    } finally {
      setIsRunning(false);
    }
  }, [controls, imageUrl, isRunning, modelId, onClose, onComplete, projectId]);

  const directions: Array<{ value: RelightDirection; label: string }> = [
    { value: "left", label: "左侧" },
    { value: "top", label: "顶部" },
    { value: "right", label: "右侧" },
    { value: "front", label: "前方" },
    { value: "bottom", label: "底部" },
    { value: "back", label: "后方" },
  ];

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute left-1/2 top-full z-50 mt-3 -translate-x-1/2 border border-white/10 p-2 text-white shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      style={{ background: "rgb(31,31,31)", borderRadius: 24 }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <button
        type="button"
        className="absolute right-2 top-2 z-10 rounded-md p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="关闭打光"
        onClick={onClose}
      >
        <X className="size-[18px]" />
      </button>
      <div className="flex gap-4">
        <div className="relative h-[322px] w-[322px] shrink-0 overflow-hidden rounded-2xl bg-[#2b2b2b]">
          <div className="flex flex-col items-center pt-2">
            <div className="flex flex-col items-center gap-1">
              <div className="flex rounded-lg bg-white/5 p-0.5">
                {[
                  ["perspective", "透视"],
                  ["front", "正面"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${controls.viewMode === value ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}
                    onClick={() =>
                      updateControl("viewMode", value as RelightViewMode)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative size-64 select-none">
                <WorkflowRelightPreview
                  imageUrl={imageUrl}
                  controls={controls}
                  onLightPositionChange={(position) =>
                    updateControl("lightPosition", position)
                  }
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            className="absolute bottom-3 right-3 flex items-center gap-1 text-[11px] font-medium text-white/30 transition-colors hover:text-white/60"
            onClick={() => setControls(RELIGHT_DEFAULT_CONTROLS)}
          >
            <RefreshCw className="size-3" />
            重置
          </button>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            <div
              className="relative flex h-[22px] items-center justify-center overflow-hidden px-3.5"
              style={{
                background: "rgb(33,33,33)",
                borderRadius: "12px 12px 0 0",
                outline: "1px solid var(--border)",
                outlineOffset: -1,
              }}
            >
              <span className="relative whitespace-nowrap pt-0.5 text-xs font-normal italic uppercase leading-4 text-[#b4b4b4]">
                主光源
              </span>
              <div className="pointer-events-none absolute bottom-[-5px] left-1/2 h-3 w-[89px] -translate-x-1/2 rounded-full bg-[#a6a196] opacity-30 blur-[3.1px]" />
            </div>
          </div>
        </div>
        <div className="flex h-[322px] w-[246px] flex-col pt-1">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-white">全局</span>
              <div className="flex flex-col gap-2">
                <WorkflowRelightSegmentSlider
                  label="亮度"
                  value={controls.brightness}
                  min={RELIGHT_BRIGHTNESS_MIN}
                  max={RELIGHT_BRIGHTNESS_MAX}
                  step={40}
                  unit="%"
                  icon={<SunMiniIcon />}
                  onChange={(value) =>
                    updateControl("brightness", Math.round(value))
                  }
                />
                <WorkflowRelightSegmentSlider
                  label="色温"
                  value={controls.colorTemperature}
                  min={RELIGHT_TEMPERATURE_MIN}
                  max={RELIGHT_TEMPERATURE_MAX}
                  step={1000}
                  unit="K"
                  temperature
                  icon={<TemperatureMiniIcon />}
                  onChange={(value) =>
                    updateControl("colorTemperature", Math.round(value))
                  }
                />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-white">主光源</span>
              <div className="grid grid-cols-3 gap-1">
                {directions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`flex h-6 items-center justify-center overflow-hidden rounded-sm px-6 text-xs font-semibold transition-colors ${controls.mainLightDirection === item.value ? "bg-input text-white shadow-[-2px_1px_6.3px_rgba(0,0,0,0.05)]" : "bg-input/30 text-muted-foreground hover:bg-input/60"}`}
                    onClick={() => setDirection(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white">轮廓光</span>
                <HelpCircleMiniIcon />
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={controls.rimLight}
                className={`inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-30 ${controls.rimLight ? "bg-popover-foreground" : "bg-input"}`}
                onClick={() => updateControl("rimLight", !controls.rimLight)}
              >
                <span
                  className={`block size-4 rounded-full bg-foreground shadow-lg transition-transform ${controls.rimLight ? "translate-x-4" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>
          <div
            className="mt-auto flex w-fit items-center justify-between gap-1 self-end rounded-full border border-white/10 p-1"
            style={{
              backdropFilter: "blur(10px)",
              background:
                "radial-gradient(94.74% 157.5% at 50% 21.25%, rgb(26, 26, 26) 0%, rgb(101, 103, 102) 100%)",
            }}
          >
            <div className="box-border flex items-center pl-1 text-sm font-medium text-popover-foreground">
              <SparklesTokenIcon />
              <span className="relative inline-flex min-w-6 justify-center tabular-nums text-[12px]">
                <span className="inline-flex w-full justify-center whitespace-nowrap">
                  {RELIGHT_RUN_CREDITS}
                </span>
              </span>
            </div>
            <button
              type="button"
              className="flex aspect-square h-6.5 w-6.5 cursor-pointer items-center justify-center rounded-full bg-white text-sm font-medium text-black transition-all hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`生成${title ? ` ${title}` : ""}打光`}
              disabled={isRunning}
              onClick={run}
            >
              {isRunning ? (
                <span className="size-3 animate-spin rounded-full border-2 border-black/25 border-t-black" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
