export type CodexTaskLifecycleStatus = "" | "queued" | "running" | "completed" | "failed" | "cancelled"

type CommandActivityRow = {
  kind: string
  activityType?: string
  streaming?: boolean
  interrupted?: boolean
  title?: string
  detail?: string
  text: string
}

function interruptedCommandTitle(status: CodexTaskLifecycleStatus) {
  if (status === "cancelled") return "命令已停止"
  if (status === "failed") return "命令已中断"
  return "命令已结束"
}

export function settleTerminalCommandActivities<T extends CommandActivityRow>(
  items: T[],
  status: CodexTaskLifecycleStatus,
) {
  if (!status || status === "queued" || status === "running") return items
  const title = interruptedCommandTitle(status)
  let changed = false
  const settled = items.map((item) => {
    if (item.kind !== "tool" || item.activityType !== "command" || !item.streaming) return item
    changed = true
    return {
      ...item,
      title,
      text: title,
      streaming: false,
      interrupted: true,
    }
  })
  return changed ? settled : items
}

function isLegacyCancellingTaskActivity(item: CommandActivityRow) {
  return /正在(?:取消|停止)(?:当前)?任务/.test([
    item.title,
    item.text,
    item.detail,
  ].filter(Boolean).join("\n"))
}

export function settleTerminalTaskActivities<T extends CommandActivityRow>(
  items: T[],
  status: CodexTaskLifecycleStatus,
) {
  const settledCommands = settleTerminalCommandActivities(items, status)
  if (status !== "cancelled") return settledCommands

  let changed = false
  const settled = settledCommands.map((item) => {
    if (!isLegacyCancellingTaskActivity(item)) return item
    changed = true
    return {
      ...item,
      title: "任务已停止",
      text: "任务已停止",
      detail: "",
      streaming: false,
      interrupted: true,
    }
  })
  return changed ? settled : settledCommands
}
