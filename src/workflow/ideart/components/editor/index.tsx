"use client";

import dynamic from "@/workflow/ideart/shims/next-dynamic";

export const LibTvWorkflowCanvas = dynamic(
  () =>
    import("./libtv-workflow-canvas").then((mod) => mod.LibTvWorkflowCanvas),
  {
    ssr: false,
    loading: () => null,
  },
);
