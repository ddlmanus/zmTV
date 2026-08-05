import "@xyflow/react/dist/style.css";
import "./ideart/workflow-canvas.css";
import "./ideart/codex-agent.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { LibTvWorkflowCanvas } from "@/workflow/ideart/components/editor";
import {
  normalizeCanvasProjectContent,
  normalizeLibTvProjectCanvases,
  type LibTvProjectCanvas,
} from "@/workflow/ideart/lib/canvas-project-content";
import { useCanvasStore } from "@/workflow/ideart/lib/store/canvas-store";
import {
  buildDesktopCanvasWorkspaceDocument,
  readDesktopCanvasWorkspace,
  type DesktopCanvasWorkspace,
  writeDesktopCanvasWorkspace,
} from "./desktop-canvas-workspace-storage";
import { useWorkflowPlatformMediaListener } from "./backend/platform-media-listener";
import {
  installWorkflowFetchInterceptor,
  workflowFetch,
} from "./backend/client";

const DESKTOP_WORKFLOW_PROJECT_ID = "zaomeng-desktop-workflow";

type DesktopWorkflowProject = {
  id?: string;
  title?: string | null;
  content?: string | null;
  error?: string;
};

function workspaceFromProject(project: DesktopWorkflowProject) {
  if (!project.content) return null;
  const content = normalizeCanvasProjectContent(JSON.parse(project.content));
  const canvases = normalizeLibTvProjectCanvases(
    content.libtvCanvases,
    content.libtvWorkflow,
  );
  const activeCanvas =
    canvases.find((canvas) => canvas.id === content.activeLibTvCanvasId) ||
    canvases[0];
  return {
    canvases,
    activeCanvasId: activeCanvas?.id || "default",
  } satisfies DesktopCanvasWorkspace;
}

function applyWorkspaceToCanvasStore(
  workspace: DesktopCanvasWorkspace,
  projectName: string,
) {
  const canvasStore = useCanvasStore.getState();
  canvasStore.setProjectId(DESKTOP_WORKFLOW_PROJECT_ID);
  canvasStore.setProjectName(projectName || "画布");
  canvasStore.setZoom(1);
  canvasStore.setStagePos({ x: 0, y: 0 });
  const activeCanvas =
    workspace.canvases.find(
      (canvas) => canvas.id === workspace.activeCanvasId,
    ) || workspace.canvases[0];
  canvasStore.initialize([]);
  canvasStore.setProjectMaterials([]);
  if (activeCanvas) canvasStore.setLibTvWorkflow(activeCanvas.libtvWorkflow);
}

export function WorkflowPage() {
  useWorkflowPlatformMediaListener();
  const [initialWorkspace, setInitialWorkspace] =
    useState<DesktopCanvasWorkspace | null>(null);
  const backendSaveTimerRef = useRef<number | null>(null);

  useEffect(() => installWorkflowFetchInterceptor(), []);

  useEffect(() => {
    let cancelled = false;
    const localWorkspace = readDesktopCanvasWorkspace();

    const useWorkspace = (workspace: DesktopCanvasWorkspace, title = "画布") => {
      if (cancelled) return;
      applyWorkspaceToCanvasStore(workspace, title);
      writeDesktopCanvasWorkspace(workspace.canvases, workspace.activeCanvasId);
      setInitialWorkspace(workspace);
    };

    if (!window.electronAPI) {
      useWorkspace(localWorkspace);
      return () => {
        cancelled = true;
      };
    }

    void workflowFetch("/api/projects/" + DESKTOP_WORKFLOW_PROJECT_ID, {
      cache: "no-store",
    })
      .then(async (response) => {
        const project = (await response
          .json()
          .catch(() => ({}))) as DesktopWorkflowProject;
        if (!response.ok) {
          throw new Error(
            project.error || "工作流项目加载失败",
          );
        }
        const remoteWorkspace = workspaceFromProject(project);
        if (remoteWorkspace) {
          useWorkspace(remoteWorkspace, String(project.title || "画布"));
          return;
        }

        const content = buildDesktopCanvasWorkspaceDocument(
          localWorkspace.canvases,
          localWorkspace.activeCanvasId,
        );
        await workflowFetch("/api/projects/" + DESKTOP_WORKFLOW_PROJECT_ID, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, responseView: "lite" }),
        });
        useWorkspace(localWorkspace, String(project.title || "画布"));
      })
      .catch((error) => {
        console.error("Failed to load desktop workflow project:", error);
        useWorkspace(localWorkspace);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCanvasWorkspaceChange = useCallback(
    (canvases: LibTvProjectCanvas[], activeCanvasId: string) => {
      try {
        writeDesktopCanvasWorkspace(canvases, activeCanvasId);
      } catch {
        // Keep the current editing session usable if local persistence is full.
      }

      if (!window.electronAPI) return;
      if (backendSaveTimerRef.current !== null) {
        window.clearTimeout(backendSaveTimerRef.current);
      }
      backendSaveTimerRef.current = window.setTimeout(() => {
        backendSaveTimerRef.current = null;
        const content = buildDesktopCanvasWorkspaceDocument(
          canvases,
          activeCanvasId,
        );
        void workflowFetch(
          "/api/projects/" + DESKTOP_WORKFLOW_PROJECT_ID,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, responseView: "lite" }),
          },
        ).then((response) => {
          if (!response.ok) {
            throw new Error("工作流项目保存失败: HTTP " + response.status);
          }
        }).catch((error) => {
          console.error("Failed to save desktop workflow project:", error);
        });
      }, 600);
    },
    [],
  );

  useEffect(
    () => () => {
      if (backendSaveTimerRef.current !== null) {
        window.clearTimeout(backendSaveTimerRef.current);
      }
    },
    [],
  );

  if (!initialWorkspace) {
    return (
      <main className="zaomeng-workflow-page flex h-full w-full items-center justify-center overflow-hidden bg-black text-sm text-white/65">
        正在加载画布...
      </main>
    );
  }

  return (
    <main className="zaomeng-workflow-page flex h-full w-full overflow-hidden bg-black">
      <LibTvWorkflowCanvas
        imageUrl={null}
        initialCanvases={initialWorkspace.canvases}
        initialActiveCanvasId={initialWorkspace.activeCanvasId}
        onCanvasWorkspaceChange={handleCanvasWorkspaceChange}
      />
    </main>
  );
}
