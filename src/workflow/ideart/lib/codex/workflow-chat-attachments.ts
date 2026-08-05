export const WORKFLOW_CHAT_ATTACHMENTS_EVENT = "zaomeng:codex:add-attachments";
export const WORKFLOW_CHAT_ATTACHMENTS_RESULT_EVENT =
  "zaomeng:codex:add-attachments-result";

export type WorkflowChatAttachmentPayload = {
  name?: string;
  path?: string;
  url?: string;
  type?: string;
  mediaKind?: string;
  nodeId?: string;
  platformFileId?: number;
  platformFileUrl?: string;
  seedanceAssetId?: string;
  seedanceAssetUrl?: string;
  seedanceAssetStatus?: string;
  seedanceAssetCategory?: string;
  portraitCompliantExempt?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
};

type WorkflowChatAttachmentResult = {
  requestId: string;
  ok: boolean;
  count?: number;
  error?: string;
};

export function isWorkflowChatAttachmentUrl(value: unknown) {
  return /^(?:https?:|data:|blob:|local-asset:|zaomeng-workflow:|\/)/i.test(
    String(value || "").trim(),
  );
}

export function settleWorkflowChatAttachmentRequest(
  result: WorkflowChatAttachmentResult,
) {
  if (typeof window === "undefined" || !result.requestId) return;
  window.dispatchEvent(
    new CustomEvent(WORKFLOW_CHAT_ATTACHMENTS_RESULT_EVENT, {
      detail: result,
    }),
  );
}

export function requestWorkflowChatAttachments(
  files: WorkflowChatAttachmentPayload[],
) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("聊天附件功能仅支持在客户端中使用"));
  }
  const requestId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `workflow-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, count?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener(
        WORKFLOW_CHAT_ATTACHMENTS_RESULT_EVENT,
        handleResult as EventListener,
      );
      if (error) reject(error);
      else resolve(Math.max(0, Number(count || files.length)));
    };
    const handleResult = (event: Event) => {
      const detail = (event as CustomEvent<WorkflowChatAttachmentResult>)
        .detail;
      if (detail?.requestId !== requestId) return;
      finish(
        detail.ok ? undefined : new Error(detail.error || "发送到聊天失败"),
        detail.count,
      );
    };
    const timeout = window.setTimeout(
      () => finish(new Error("发送到聊天超时，请重试")),
      10 * 60 * 1000,
    );
    window.addEventListener(
      WORKFLOW_CHAT_ATTACHMENTS_RESULT_EVENT,
      handleResult as EventListener,
    );
    window.dispatchEvent(
      new CustomEvent(WORKFLOW_CHAT_ATTACHMENTS_EVENT, {
        detail: { requestId, files },
      }),
    );
  });
}
