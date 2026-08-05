"use client";

import React, { useEffect, useRef } from "react";
import { useStoreApi, type Edge, type Node } from "@xyflow/react";
import type { WorkflowOverlayNodeData } from "./surface-contracts";

export function resolveWorkflowFloatScale(zoom: number) {
  const viewportZoom = Math.max(0.15, Number(zoom || 1));
  // LibTV keeps floating generation bars at a stable screen size.  Do not cap
  // the inverse scale at 1.35: at 31% canvas zoom the reference UI measures
  // ~3.26925 (= 1 / 0.306) and remains fully interactive.
  return Math.max(0.125, Math.min(6.667, 1 / viewportZoom));
}

export function WorkflowFloatScaleSync({
  surfaceRef,
  onZoomChange,
}: {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  onZoomChange?: (zoom: number) => void;
}) {
  const store = useStoreApi<Node<WorkflowOverlayNodeData>, Edge>();
  const lastZoomRef = useRef<number | null>(null);

  useEffect(() => {
    const applyZoomScale = (zoom: number) => {
      if (
        lastZoomRef.current !== null &&
        Math.abs(lastZoomRef.current - zoom) < 0.001
      )
        return;
      lastZoomRef.current = zoom;
      surfaceRef.current?.style.setProperty(
        "--workflow-float-scale",
        String(resolveWorkflowFloatScale(zoom)),
      );
      onZoomChange?.(zoom);
    };

    applyZoomScale(store.getState().transform[2]);
    return store.subscribe((state) => {
      applyZoomScale(state.transform[2]);
    });
  }, [onZoomChange, store, surfaceRef]);

  return null;
}
