export const WORKFLOW_CHARACTER_IMAGE_CLASSIFICATION_PROMPT = [
  "请判断这张图片是否适合作为视频生成器的“角色库/人物角色素材”。",
  "",
  "只输出 JSON，不要 markdown。",
  "",
  "判定规则：",
  "- 只有图片主体是人物、真人模特、虚拟人像、动漫/插画人物、角色三视图、角色设定图、拟人角色时，才 isCharacterAsset=true。",
  "- 室内场景、卧室、建筑、产品、家具、风景、普通道具、纯构图参考、没有明确角色主体的图片，必须 isCharacterAsset=false。",
  "- 如果图片里只是远处很小的人、装饰性人物、海报中的人物，不应作为角色库。",
  "",
  "输出 JSON：",
  "{",
  '  "isCharacterAsset": true,',
  '  "score": 0-100,',
  '  "category": "person | human_character | cartoon_character | animal_character | non_character | scene | product | other",',
  '  "reason": "一句话说明"',
  "}",
].join("\n");

export type WorkflowCharacterImageClassification = {
  isCharacterAsset: boolean;
  score: number;
  reason: string;
  category:
    | "person"
    | "human_character"
    | "cartoon_character"
    | "animal_character"
    | "non_character"
    | "scene"
    | "product"
    | "other";
};

export function normalizeWorkflowCharacterImageClassification(
  raw: Partial<WorkflowCharacterImageClassification> | null | undefined,
): WorkflowCharacterImageClassification {
  const scoreRaw = Number(raw?.score);
  const score = Number.isFinite(scoreRaw)
    ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
    : 0;
  const category = String(raw?.category || "other").trim();
  const allowed = new Set<WorkflowCharacterImageClassification["category"]>([
    "person",
    "human_character",
    "cartoon_character",
    "animal_character",
    "non_character",
    "scene",
    "product",
    "other",
  ]);
  const normalizedCategory = allowed.has(
    category as WorkflowCharacterImageClassification["category"],
  )
    ? (category as WorkflowCharacterImageClassification["category"])
    : "other";
  const characterCategory = [
    "person",
    "human_character",
    "cartoon_character",
    "animal_character",
  ].includes(normalizedCategory);

  return {
    isCharacterAsset:
      Boolean(raw?.isCharacterAsset) && characterCategory && score >= 70,
    score,
    reason:
      String(raw?.reason || "").trim() ||
      (characterCategory
        ? "检测到人物或角色主体"
        : "未检测到可作为角色库的人物主体"),
    category: normalizedCategory,
  };
}
