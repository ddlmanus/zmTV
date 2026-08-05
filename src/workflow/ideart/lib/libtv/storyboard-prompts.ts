import type {
  LibTvStoryboardScriptResult,
  LibTvStoryboardScriptRow,
} from "./script";
import {
  formatLibTvCharacterProfiles,
  formatLibTvSceneProfiles,
} from "./storyboard-guidelines";

type CharacterProfile = {
  name: string;
  description: string;
  aliases?: string[];
};

type SceneProfile = {
  key: string;
  description: string;
};

type ContinuityPackage = {
  visualMediumLock: string;
  worldLock: string;
  sceneLock: string;
  styleLock: string;
  wardrobeLock: string;
  prohibitedDrifts: string[];
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function extractExplicitStyleLock(row: LibTvStoryboardScriptRow) {
  const text = [
    row.storyboardPrompt,
    row.visualDescription,
    row.sceneTags,
    row.lightingAtmosphere,
  ]
    .map((item) => String(item || ""))
    .filter(Boolean)
    .join("\n");
  if (!text) return "";

  const styleMatch = text.match(
    /[［\[]\s*视觉风格\s*[：:]\s*([^\]］\n]+)[\]］]/i,
  );
  const styleText = normalizeText(styleMatch?.[1]);
  if (styleText) return styleText;

  const candidates = [
    /(3D\s*皮克斯动画质感|皮克斯动画质感|pixar[^，。；\]\n]*|3d[^，。；\]\n]*(?:动画|卡通|cg)[^，。；\]\n]*|夸张漫画风|漫画风|动漫风|二次元|插画风)/i,
  ];
  for (const pattern of candidates) {
    const matched = text.match(pattern);
    if (matched?.[0]) return normalizeText(matched[0]);
  }

  return "";
}

function formatRowDetails(row: LibTvStoryboardScriptRow, rowIndex: number) {
  return [
    `镜号：${normalizeText(row.shotNumber) || String(rowIndex + 1)}`,
    row.duration ? `时长：${row.duration}` : "",
    row.visualDescription ? `画面描述：${row.visualDescription}` : "",
    row.character1 ? `角色1：${row.character1}` : "",
    row.characterDescription1 ? `角色描述1：${row.characterDescription1}` : "",
    row.character2 ? `角色2：${row.character2}` : "",
    row.characterDescription2 ? `角色描述2：${row.characterDescription2}` : "",
    row.shotType ? `景别：${row.shotType}` : "",
    row.characterAction ? `角色动作：${row.characterAction}` : "",
    row.emotion ? `情绪：${row.emotion}` : "",
    row.sceneTags ? `场景标签：${row.sceneTags}` : "",
    row.lightingAtmosphere ? `光影氛围：${row.lightingAtmosphere}` : "",
    row.soundEffect ? `音效：${row.soundEffect}` : "",
    row.dialogue ? `对白：${row.dialogue}` : "",
    row.storyboardPrompt ? `分镜提示词：${row.storyboardPrompt}` : "",
    row.motionPrompt ? `运动提示词：${row.motionPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildNeighborContext(
  rows: LibTvStoryboardScriptRow[],
  rowIndex: number,
) {
  const items: string[] = [];
  const previous = rows[rowIndex - 1];
  const next = rows[rowIndex + 1];

  if (previous) {
    items.push(`前一镜参考：\n${formatRowDetails(previous, rowIndex - 1)}`);
  }
  if (next) {
    items.push(`后一镜参考：\n${formatRowDetails(next, rowIndex + 1)}`);
  }

  return items.join("\n\n");
}

export function buildLibTvOfficialStoryboardPrompt(params: {
  title: string;
  result: LibTvStoryboardScriptResult;
  selectedRowIndexes: number[];
  characterProfiles: CharacterProfile[];
  characterBaseAssetsText?: string;
  sceneProfiles: SceneProfile[];
  continuityPackage: ContinuityPackage;
  upstreamTexts: string[];
  referenceImageUrls: string[];
  aspectRatio: string;
  imageSize: string;
  cameraControlHint?: string;
}) {
  const selectedBlocks = params.selectedRowIndexes
    .map((rowIndex) => {
      const row = params.result.rows[rowIndex];
      if (!row) return "";
      const neighborContext = buildNeighborContext(
        params.result.rows,
        rowIndex,
      );
      return [
        `### 目标镜头 ${row.shotNumber || rowIndex + 1}`,
        formatRowDetails(row, rowIndex),
        neighborContext ? `上下文参考：\n${neighborContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const referenceBlock =
    params.referenceImageUrls.length > 0
      ? `共 ${params.referenceImageUrls.length} 张参考图，这些参考图会通过模型参考图字段单独传入，不要把图片链接或 base64 当作文本内容复述。`
      : "无";

  return [
    "请根据我提供的既定分镜脚本，连续生成故事板分镜图。",
    "这是分镜出图任务，不是重写剧本任务。",
    "",
    "硬性要求：",
    "1. 严格忠于脚本内容，不新增剧情、不改角色、不换场景逻辑。",
    "2. 同一角色在所有镜头里必须保持同一名称、同一外观锚点、同一服装配饰和同一气质。",
    "2.1 如果剧本没有明确写到造型状态变化、身份伪装、形态变化、环境造成的外观变化或剧情驱动的装束变化，必须沿用 canonical 角色参考中的默认造型，不得自行更换。",
    "2.2 如果剧本没有明确指定视觉媒介或美术体系，你必须自主选择最适合剧情的单一视觉风格，并把它作为整批镜头的统一风格，不得中途漂移。",
    `3. 按镜号顺序生成，每个目标镜头只生成 1 张静态分镜图，共 ${params.selectedRowIndexes.length} 张。`,
    "4. 输出必须是单张故事板/电影分镜风格画面，不要拼贴、不要宫格、不要字幕、不要 UI、不要水印。",
    "5. 如果提供了参考图，必须把其中的 canonical 角色身份、脸部特征、发型、服装、材质、配饰、空间事实当成硬约束，不得只参考模糊氛围。",
    "5.1 禁止把角色图理解成仅供参考的情绪板，角色图里的脸、发型、服装和配饰优先级高于你自己的想象补全。",
    "5.2 角色基座资产是角色本体与造型锚点层，镜头态只允许改变动作、表情、机位、光线和脚本允许的状态变化；只有镜头态明确写了 wardrobeOverride / 本镜头造型变化时才允许改变造型，否则必须继承默认造型。",
    "5.3 如果某镜头已经绑定角色基座图，你必须把该图视为演员本人，不得借用其他参考图重新发明另一张脸，也不得把场景图/邻镜图的氛围覆盖到角色身份上。",
    `6. 画面比例优先 ${params.aspectRatio}，清晰度优先 ${params.imageSize}。`,
    params.cameraControlHint
      ? `7. 运镜/镜头控制需要尽量体现在单帧构图里：\n${params.cameraControlHint}`
      : "",
    "",
    `项目标题：${params.title}`,
    params.result.summary ? `脚本总结：${params.result.summary}` : "",
    params.result.userPrompt
      ? `脚本节点补充要求：${params.result.userPrompt}`
      : "",
    `连续性总控包：\n- ${params.continuityPackage.visualMediumLock}\n- ${params.continuityPackage.worldLock}\n- ${params.continuityPackage.sceneLock}\n- ${params.continuityPackage.styleLock}\n- ${params.continuityPackage.wardrobeLock}\n- ${params.continuityPackage.prohibitedDrifts.join("\n- ")}`,
    `角色一致性约束：\n${formatLibTvCharacterProfiles(params.characterProfiles)}`,
    params.characterBaseAssetsText
      ? `角色基座资产（不可重写，只能引用）：\n${params.characterBaseAssetsText}`
      : "",
    `场景一致性约束：\n${formatLibTvSceneProfiles(params.sceneProfiles)}`,
    params.upstreamTexts.length > 0
      ? `上游文本参考：\n${params.upstreamTexts.join("\n\n")}`
      : "",
    params.result.sourceScript
      ? `原始剧本：\n${String(params.result.sourceScript).slice(0, 6000)}`
      : "",
    `参考图片（其中人物/场景标准参考图的优先级最高）：\n${referenceBlock}`,
    `需要生成的目标镜头：\n${selectedBlocks}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildLibTvLocalStoryboardPrompt(params: {
  title: string;
  result: LibTvStoryboardScriptResult;
  rowIndex: number;
  characterProfiles: CharacterProfile[];
  characterBaseAssetsText?: string;
  shotStateText?: string;
  sceneProfiles: SceneProfile[];
  continuityPackage: ContinuityPackage;
  cameraControlHint?: string;
}) {
  const row = params.result.rows[params.rowIndex];
  const neighborContext = buildNeighborContext(
    params.result.rows,
    params.rowIndex,
  );
  const explicitStyleLock = extractExplicitStyleLock(row);

  return [
    "你现在要为既定影视分镜脚本生成单张分镜图。",
    "你的任务是严格执行当前镜头，而不是改写故事。",
    "",
    "硬性要求：",
    "0. 当前镜头的“分镜提示词 / storyboardPrompt”是本张图的最高执行文本；必须逐项执行其中的画面构图、主体关系、微表情、场景环境、光影几何、视觉风格和技术参数。",
    "0.1 角色描述只用于锁定角色外貌、服装、材质、体态和配饰；不得让角色描述覆盖 storyboardPrompt 里的整体视觉风格、镜头语言和场景构图。",
    explicitStyleLock
      ? `0.2 本镜头显式视觉风格硬锁：${explicitStyleLock}。必须以此作为最终画面媒介与材质语言。`
      : "",
    explicitStyleLock
      ? "0.3 禁止输出与显式视觉风格冲突的媒介、材质或渲染语言；即使角色有现实化外貌或真实服装，也必须转译到上述显式视觉风格中。"
      : "",
    "1. 严格忠于当前镜头与整份脚本，不新增角色、不替换服装、不改事件。",
    "2. 同一角色必须保持稳定的发型、服饰、材质、配饰、体态和气质。",
    "2.0 角色本体锁定：先判断角色描述中的本体身份、主体类型和局部特征层级。局部特征、配饰、纹理、器官、道具、材质或风格化修饰只能附着在既定本体上，不得反向吞噬或替换本体身份；除非脚本明确要求变身、物种/形态转换或重设角色主体，否则必须保持角色参考图与角色档案中的主体结构。",
    "2.1 若当前镜头未明确写到造型状态变化、身份伪装、形态变化、环境造成的外观变化或剧情驱动的装束变化，必须继承角色 canonical 参考中的默认造型，不得自行更换。",
    "2.2 若整份脚本未明确要求视觉媒介或美术体系，则默认采用最适合剧情的统一分镜视觉风格，不得让当前镜头跳成另一种媒介。",
    "2.3 角色基座资产是不可变的角色本体与造型锚点；当前镜头态只描述动作、表情、机位、光线和脚本允许的状态变化。不得根据当前画面描述重新设计五官、发型、肤色、体态或默认造型。",
    "3. 画面只输出一张高质量分镜图，不要文字、不要拼贴、不要 UI、不要水印。",
    "4. 如果当前镜头与相邻镜头或角色设定冲突，以当前镜头 storyboardPrompt 的画面/构图/风格指令、canonical 角色/场景参考、一致性档案和剧本原文为最高优先级。",
    "4.1 如果当前镜头已经提供角色基座图，必须严格继承该角色的脸型、五官、肤色、发型、默认服装与配饰；不得因为画面描述里有时代、氛围或动作词就换成另一张脸。",
    params.cameraControlHint
      ? `5. 如果提供了镜头/运镜控制，请把它体现在当前单帧构图、机位、透视和主体位置中：\n${params.cameraControlHint}`
      : "",
    "",
    `当前镜头 storyboardPrompt 原文（必须优先执行）：\n${normalizeText(row.storyboardPrompt) || "无"}`,
    `项目标题：${params.title}`,
    params.result.summary ? `全局总结：${params.result.summary}` : "",
    params.result.userPrompt
      ? `脚本节点补充要求：${params.result.userPrompt}`
      : "",
    `连续性总控包：\n- ${params.continuityPackage.visualMediumLock}\n- ${params.continuityPackage.worldLock}\n- ${params.continuityPackage.sceneLock}\n- ${params.continuityPackage.styleLock}\n- ${params.continuityPackage.wardrobeLock}\n- ${params.continuityPackage.prohibitedDrifts.join("\n- ")}`,
    `角色一致性档案：\n${formatLibTvCharacterProfiles(params.characterProfiles)}`,
    params.characterBaseAssetsText
      ? `角色基座资产（不可重写，只能引用）：\n${params.characterBaseAssetsText}`
      : "",
    params.shotStateText
      ? `当前镜头态资产（只允许影响本镜头动作/情绪/机位/光线/脚本允许的状态变化）：\n${params.shotStateText}`
      : "",
    `场景一致性档案：\n${formatLibTvSceneProfiles(params.sceneProfiles)}`,
    params.result.sourceScript
      ? `原始剧本摘录：\n${String(params.result.sourceScript).slice(0, 4000)}`
      : "",
    `当前镜头：\n${formatRowDetails(row, params.rowIndex)}`,
    neighborContext ? `相邻镜头参考：\n${neighborContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
