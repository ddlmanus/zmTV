import { randomUUID } from "node:crypto";
import { ipcMain, type BrowserWindow } from "electron";
import type {
  WorkflowPlatformMediaRequest,
  WorkflowPlatformMediaResponse,
  WorkflowPlatformMediaResult,
} from "../../src/types/workflowBackend";
import {
  configureDesktopPlatformMedia,
  type CodexPlatformMediaRequest,
} from "./agent/platform-media";

const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

type PendingRequest = {
  resolve: (result: WorkflowPlatformMediaResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<string, PendingRequest>();

function settleRequest(
  requestId: string,
  response: WorkflowPlatformMediaResponse,
) {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;
  pendingRequests.delete(requestId);
  clearTimeout(pending.timer);
  if (response.ok) pending.resolve(response.result);
  else pending.reject(new Error(response.error || "模型生成失败"));
}

function requestRenderer(
  getWindow: () => BrowserWindow | null,
  request: CodexPlatformMediaRequest,
) {
  const window = getWindow();
  if (!window || window.isDestroyed()) {
    throw new Error("工作流窗口未打开，无法调用当前供应商模型");
  }

  const requestId = "workflow_media_" + randomUUID();
  const payload: WorkflowPlatformMediaRequest = {
    requestId,
    projectId: request.project?.id,
    projectPath: request.project?.path,
    body: request.body,
  };

  return new Promise<WorkflowPlatformMediaResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("模型生成等待超时，请在画布中检查任务状态"));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, reject, timer });
    window.webContents.send("workflow-platform-media:request", payload);
  });
}

export function registerWorkflowPlatformMediaBroker(
  getWindow: () => BrowserWindow | null,
) {
  ipcMain.removeAllListeners("workflow-platform-media:response");
  ipcMain.on(
    "workflow-platform-media:response",
    (
      _event,
      requestId: string,
      response: WorkflowPlatformMediaResponse,
    ) => settleRequest(String(requestId || ""), response),
  );
  configureDesktopPlatformMedia((request) => requestRenderer(getWindow, request));
}

export function disposeWorkflowPlatformMediaBroker() {
  configureDesktopPlatformMedia(null);
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("应用正在退出，生成任务已停止等待"));
  }
  pendingRequests.clear();
}
