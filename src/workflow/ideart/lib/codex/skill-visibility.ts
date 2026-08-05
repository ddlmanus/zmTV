export type CodexSkillSummary = {
  id: string
  name: string
  description?: string
  path: string
  scope: string
}

const CODEX_SKILL_COVERS: Record<string, string> = {
  "agent-reach": "/images/codex-skills/agent-reach.png",
  "aishuch-imagegen": "/images/codex-skills/aishuch-imagegen.png",
  "ai-film-director": "/images/codex-skills/ai-film-director.png",
  "amazon-listing-images": "/images/codex-skills/amazon-listing-images.png",
  "ecommerce-image-workflow": "/images/codex-skills/ecommerce-image-workflow.png",
  "ecommerce-product-system": "/images/codex-skills/ecommerce-image-workflow.png",
  "guizang-ppt-skill": "/images/codex-skills/guizang-ppt-skill.png",
  imagegen: "/images/codex-skills/imagegen.png",
  "openai-docs": "/images/codex-skills/openai-docs.png",
  "novel-to-film-pipeline": "/images/codex-skills/novel-to-film-pipeline.png",
  "platform-media": "/images/codex-skills/platform-media.png",
  "plugin-creator": "/images/codex-skills/plugin-creator.png",
  pptx: "/images/codex-skills/pptx.png",
  "product-page-design": "/images/codex-skills/product-page-design.png",
  "review-agent": "/images/codex-skills/review-agent.png",
  "saas-product-demo-video": "/images/codex-skills/saas-product-demo-video.png",
  "short-form-video": "/images/codex-skills/short-form-video.png",
  "skill-creator": "/images/codex-skills/skill-creator.png",
  "skill-installer": "/images/codex-skills/skill-installer.png",
  "tvc-director": "/images/codex-skills/tvc-director.png",
  "viral-commerce-short-drama": "/images/codex-skills/viral-commerce-short-drama.png",
  "video-replication": "/images/codex-skills/video-replication.png",
  "video-shotcraft": "/images/codex-skills/video-shotcraft.png",
  "wavespeed-media": "/images/codex-skills/wavespeed-media.png",
}

const CODEX_SKILL_CHINESE_NAMES: Record<string, string> = {
  "agent-reach": "Agent Reach 全网搜索",
  "aishuch-imagegen": "爱数创图像生成",
  "ai-film-director": "AI 电影与短剧导演",
  "amazon-listing-images": "亚马逊产品套图",
  "ecommerce-image-workflow": "商品主图与套图",
  "ecommerce-product-system": "商品主图与详情页组图",
  "guizang-ppt-skill": "归藏网页演示",
  imagegen: "图像生成与编辑",
  "openai-docs": "OpenAI 官方文档",
  "novel-to-film-pipeline": "小说影视化流水线",
  "platform-media": "平台媒体生成",
  "pixar-animation-ad": "皮克斯动画广告",
  "plugin-creator": "Codex 插件创建",
  pptx: "PowerPoint 演示文稿",
  "product-page-design": "商品详情页设计",
  "review-agent": "代码审查助手",
  "saas-product-demo-video": "SaaS 产品宣传片",
  "short-form-video": "高留存竖屏短视频",
  "skill-creator": "专业技能创建",
  "skill-installer": "技能安装管理",
  "tvc-director": "TVC 商业广告导演",
  "viral-commerce-short-drama": "爆款带货短剧",
  "video-replication": "视频复刻",
  "video-shotcraft": "电影感产品视频",
  "wavespeed-media": "WaveSpeed 媒体生成",
}

const CODEX_SKILL_CHINESE_DESCRIPTIONS: Record<string, string> = {
  "agent-reach": "自动搜索和读取网页、社交平台、代码、视频与播客内容。",
  "aishuch-imagegen": "通过爱数创兼容接口生成和编辑高质量图片。",
  "ai-film-director": "把故事转成角色连续、分镜专业且可合成的电影化 AI 视频。",
  "amazon-listing-images": "规划并生成合规的 Amazon 主图、辅图和转化型信息图。",
  "ecommerce-image-workflow": "基于真实商品生成主图、卖点图和不同背景的生活场景套图。",
  "ecommerce-product-system": "复用原全品类组图效果，基于真实商品生成高一致性的主图和详情页套组。",
  "guizang-ppt-skill": "制作杂志风或瑞士风的横向翻页网页演示。",
  imagegen: "根据文字或参考图生成、编辑专业位图视觉。",
  "openai-docs": "检索 OpenAI 与 Codex 官方文档并提供准确指引。",
  "novel-to-film-pipeline": "从长篇小说理解、改编剧本和统一资产一直制作到最终视频成片。",
  "platform-media": "通过平台模型生成图片、视频、音频和 3D 资产。",
  "pixar-animation-ad": "从原生脚本、角色场景道具资产和分镜图开始，全自动制作15–90秒3D卡通品牌广告成片。",
  "plugin-creator": "创建带标准清单、技能和工具的 Codex 插件。",
  pptx: "创建、读取、编辑和验证 PowerPoint 演示文稿。",
  "product-page-design": "设计并实现响应式、高转化且可完成购买的商品详情页。",
  "review-agent": "检查代码质量、缺陷、风险和可维护性问题。",
  "saas-product-demo-video": "用真实产品页面、品牌系统和节拍制作 Remotion 商用宣传片。",
  "short-form-video": "制作具有首秒钩子、留存节奏、字幕安全区和循环结构的竖屏短视频。",
  "skill-creator": "根据专业需求创建、更新并验证 Codex Skill。",
  "skill-installer": "从精选目录或代码仓库安装 Codex Skill。",
  "tvc-director": "使用造梦完成品牌 TVC、产品宣传片和商业广告短片成片。",
  "viral-commerce-short-drama": "用剧情冲突、真实商品证据和高留存节奏制作可成交短剧成片。",
  "video-replication": "分析参考视频并复刻镜头、节奏和视觉表达。",
  "video-shotcraft": "用镜头配方与真实页面素材制作电影感产品视频。",
  "wavespeed-media": "使用 WaveSpeed 生成图片和视频媒体。",
}

export const SKILL_CREATOR_STARTER_PROMPT = "请先了解我希望创建的专业技能。请引导我描述它要解决的问题、触发场景、输入输出、执行流程和质量要求，然后使用 Skill Creator 为当前账号创建并验证这个 Skill。"

function normalizedSkillId(skill: Pick<CodexSkillSummary, "id">) {
  return String(skill.id || "")
    .trim()
    .replace(/^\.system\//, "")
    .replace(/^.*\//, "")
    .toLowerCase()
}

export function isFrontEndSelectableCodexSkill(skill: Pick<CodexSkillSummary, "id" | "path">) {
  const id = String(skill.id || "").trim()
  return Boolean(id && String(skill.path || "").trim()) && id !== ".system/agnes-media"
}

export function isOfficialCodexSkill(skill: Pick<CodexSkillSummary, "id" | "scope">) {
  return String(skill.scope || "").trim().toLowerCase() === "system"
    || String(skill.id || "").trim().startsWith(".system/")
}

export function isCodexSkillCreator(skill: Pick<CodexSkillSummary, "id" | "name">) {
  return normalizedSkillId(skill) === "skill-creator"
    || String(skill.name || "").trim().toLowerCase() === "skill creator"
}

export function codexSkillCoverUrl(skill: Pick<CodexSkillSummary, "id">) {
  if (typeof window !== "undefined" && window.electronAPI) {
    const bundled = CODEX_SKILL_COVERS[normalizedSkillId(skill)]
    if (bundled) return bundled
    return workflowApiUrl(
      "/api/codex/skills/cover?id=" + encodeURIComponent(String(skill.id || "").trim()),
    )
  }
  return CODEX_SKILL_COVERS[normalizedSkillId(skill)]
    || `/api/codex/skills/cover?id=${encodeURIComponent(String(skill.id || "").trim())}`
}

export function codexSkillDisplayName(skill: Pick<CodexSkillSummary, "id" | "name">) {
  return CODEX_SKILL_CHINESE_NAMES[normalizedSkillId(skill)] || String(skill.name || skill.id || "技能").trim()
}

export function codexSkillDisplayDescription(skill: Pick<CodexSkillSummary, "id" | "description">) {
  return CODEX_SKILL_CHINESE_DESCRIPTIONS[normalizedSkillId(skill)]
    || String(skill.description || "Codex 可按需读取并执行这个 Skill。").trim()
}
import { workflowApiUrl } from "@/workflow/backend/client"
