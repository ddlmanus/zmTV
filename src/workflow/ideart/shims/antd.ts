import {
  destroyWorkflowMessage,
  normalizeMessageKind,
  showWorkflowMessage,
  type MessageConfig,
} from "./antd-message-overlay";

type MessageContent = unknown | MessageConfig;

export const message = {
  success: (content: MessageContent) =>
    showWorkflowMessage("success", content, "操作成功"),
  error: (content: MessageContent) =>
    showWorkflowMessage("error", content, "操作失败"),
  warning: (content: MessageContent) =>
    showWorkflowMessage("warning", content, "请注意"),
  info: (content: MessageContent) => showWorkflowMessage("info", content, ""),
  loading: (content: MessageContent) =>
    showWorkflowMessage("loading", content, "处理中..."),
  destroy: (key?: unknown) => destroyWorkflowMessage(key),
  open: (config: MessageContent) =>
    showWorkflowMessage(
      normalizeMessageKind(
        config && typeof config === "object" && "type" in config
          ? (config as MessageConfig).type
          : "info",
      ),
      config,
      "",
    ),
};
