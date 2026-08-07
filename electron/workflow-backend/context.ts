import type { WorkflowBackendProviderConfig } from "./server";
import { WorkflowJsonStore } from "./storage";

export type WorkflowBackendContext = {
  appRoot: string;
  runtimeRoot: string;
  resourcesRoot: string;
  store: WorkflowJsonStore;
  getProviderConfig: () => WorkflowBackendProviderConfig;
  getPlatformProviderConfig: () => WorkflowBackendProviderConfig;
  fetchRemote: typeof fetch;
  runCodexTask: (input: {
    prompt: string;
    model?: string;
    workflowProjectId?: string;
    workflowProjectName?: string;
    canvasSessionId?: string;
    onProgress?: (progress: { status: string; taskId: string }) => void;
  }) => Promise<{ output: string; taskId: string; model: string }>;
};
