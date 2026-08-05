import type {
  WorkflowPlatformMediaBody,
  WorkflowPlatformMediaResult,
} from "../../../src/types/workflowBackend";

export type CodexPlatformMediaProject = {
  id: string;
  userId: string;
  path: string;
};

export type CodexPlatformMediaRequest = {
  userId: string;
  project?: CodexPlatformMediaProject | null;
  requestUrl?: string;
  body: WorkflowPlatformMediaBody;
};

type DesktopPlatformMediaHandler = (
  request: CodexPlatformMediaRequest,
) => Promise<WorkflowPlatformMediaResult>;

let desktopPlatformMediaHandler: DesktopPlatformMediaHandler | null = null;

export function configureDesktopPlatformMedia(
  handler: DesktopPlatformMediaHandler | null,
) {
  desktopPlatformMediaHandler = handler;
}

export async function generateCodexPlatformMedia(
  request: CodexPlatformMediaRequest,
) {
  if (!desktopPlatformMediaHandler) {
    throw new Error("桌面端模型运行器尚未连接，请保持工作流画布打开后重试");
  }
  return desktopPlatformMediaHandler(request);
}
