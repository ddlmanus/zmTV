export type LibTvScriptSkillOptionId =
  | "storyboard-script"
  | "video-storyboard-script"
  | "character-storyboard-script"

export type LibTvScriptSkillExecutionMode = "self-hosted-primary"

export interface LibTvScriptSkillCapability {
  id: LibTvScriptSkillOptionId
  label: string
  description: string
  intent: string
  analysisFocus: string
  optionGuide: string
  requiresVideoReference: boolean
  emphasizesCharacterConsistency: boolean
  executionMode: LibTvScriptSkillExecutionMode
}

export const DEFAULT_LIBTV_SCRIPT_SKILL_OPTION_ID: LibTvScriptSkillOptionId = "storyboard-script"

export const LIBTV_SCRIPT_SKILL_CAPABILITIES: LibTvScriptSkillCapability[] = [
  {
    id: "storyboard-script",
    label: "故事生成镜头脚本",
    description: "根据故事梗概整理成可执行的镜头脚本",
    intent: "根据故事生成脚本",
    analysisFocus: "以故事事件顺序为主轴，生成忠于原文的镜头脚本。",
    optionGuide: "标准镜头拆解，重点补全画面描述、画面提示词和视频运动提示词。",
    requiresVideoReference: false,
    emphasizesCharacterConsistency: false,
    executionMode: "self-hosted-primary",
  },
  {
    id: "video-storyboard-script",
    label: "视频参考生成镜头脚本",
    description: "结合参考视频拆解镜头与节奏，生成镜头脚本",
    intent: "根据参考视频生成脚本",
    analysisFocus: "优先还原参考视频的主体、构图、景别切换、镜头衔接与节奏。",
    optionGuide: "重点吸收视频参考带来的镜头节奏、景别切换和运动提示词。",
    requiresVideoReference: true,
    emphasizesCharacterConsistency: false,
    executionMode: "self-hosted-primary",
  },
  {
    id: "character-storyboard-script",
    label: "人物生成镜头脚本",
    description: "结合人物设定生成更聚焦人物表现的镜头脚本",
    intent: "人物生成分镜信息",
    analysisFocus: "强化人物识别锚点、人物动作与跨镜头一致性约束。",
    optionGuide: "重点强化人物形象一致性、人物描述和人物动作设计。",
    requiresVideoReference: false,
    emphasizesCharacterConsistency: true,
    executionMode: "self-hosted-primary",
  },
]

export const LIBTV_SCRIPT_NODE_OPTION_DESCRIPTORS = LIBTV_SCRIPT_SKILL_CAPABILITIES.map((capability) => ({
  id: capability.id,
  label: capability.label,
  description: capability.description,
}))

export const LIBTV_SCRIPT_NODE_OPTIONS = LIBTV_SCRIPT_NODE_OPTION_DESCRIPTORS.map(({ id, label }) => ({
  id,
  label,
}))

export const LIBTV_SCRIPT_STORYBOARD_OPTION_IDS = new Set<string>(
  LIBTV_SCRIPT_SKILL_CAPABILITIES.map((capability) => capability.id)
)

export const LIBTV_STORYBOARD_GENERATION_SKILL = {
  id: "storyboard-generate",
  label: "镜头脚本生成分镜",
  description: "根据镜头脚本逐镜生成对应的分镜图",
  intent: "镜头脚本生成分镜",
  executionMode: "self-hosted-primary" as const,
}

export function getLibTvScriptSkillCapability(
  optionId: string | null | undefined
): LibTvScriptSkillCapability {
  const normalized = String(optionId || "").trim() as LibTvScriptSkillOptionId
  return (
    LIBTV_SCRIPT_SKILL_CAPABILITIES.find((capability) => capability.id === normalized)
    || LIBTV_SCRIPT_SKILL_CAPABILITIES[0]
  )
}
