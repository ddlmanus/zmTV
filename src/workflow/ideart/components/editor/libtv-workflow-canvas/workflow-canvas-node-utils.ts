import type { LibTvWorkflowNode, LibTvWorkflowNodeKind } from "@/workflow/ideart/lib/libtv/workflow"

const WORKFLOW_NODE_TITLE_PREFIX: Record<LibTvWorkflowNodeKind, string> = {
    text: "文本生成器",
    image: "图片生成器",
    video: "视频生成器",
    audio: "音频生成器",
    script: "脚本生成器",
    "script-v2": "脚本生成器",
    playlist: "视频合成",
    threed: "3D 世界",
    "director-console-3d": "3D 导演台",
    group: "分组",
}

export function getNumberedWorkflowNodeTitle(kind: LibTvWorkflowNodeKind, nodes: LibTvWorkflowNode[], offset = 0) {
    const prefix = WORKFLOW_NODE_TITLE_PREFIX[kind] || "节点"
    const sameKindCount = nodes.filter((node) => node.kind === kind).length
    return `${prefix}${sameKindCount + offset + 1}`
}
