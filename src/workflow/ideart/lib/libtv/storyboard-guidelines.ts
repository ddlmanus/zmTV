import type {
  LibTvStoryboardCharacterProfile,
  LibTvStoryboardSceneProfile,
  LibTvStoryboardScriptResult,
  LibTvStoryboardScriptRow,
} from "./script";

export type LibTvContinuityPackage = {
  visualMediumLock: string;
  worldLock: string;
  sceneLock: string;
  styleLock: string;
  wardrobeLock: string;
  prohibitedDrifts: string[];
};

type CharacterProfileLike = Pick<
  LibTvStoryboardCharacterProfile,
  "name" | "description"
> & {
  aliases?: string[];
};

type SceneProfileLike = Pick<
  LibTvStoryboardSceneProfile,
  "key" | "description"
>;

export const LIBTV_STORYBOARD_PIPELINE_GUIDELINES = [
  "先抽角色，再抽场景，再按事件顺序拆镜头，禁止直接跳到自由发挥式写分镜。",
  "每行分镜都必须能回溯到原剧本中的角色、场景和事件，不得凭空改故事。",
  "角色一致性靠稳定角色键，场景一致性靠稳定场景键，同键镜头必须复用同一套外观与空间事实。",
  "参考图不是氛围图，而是 canonical reference；已确定的人物、服装、材质、道具和空间必须优先继承。",
].join("\n");

export const LIBTV_CHARACTER_EXTRACTION_GUIDELINES = [
  "只提取当前输入里真实出现或被明确暗示的角色，不重扫整个世界观，也不发明新角色。",
  "角色名称优先复用原文称呼；若同一角色存在多个称呼，统一主名并记录 aliases。",
  "角色描述必须突出稳定视觉锚点，例如年龄感、发型、服装、配色、材质、配饰、体态、气质和标志性动作。",
  "如果项目里已有同名或同设定角色，应优先复用同一角色键，不要重新造一个近似角色。",
].join("\n");

export const LIBTV_SCENE_EXTRACTION_GUIDELINES = [
  "只提取当前输入真实涉及的场景，不生成与当前剧情无关的背景。",
  "场景描述必须包含地点、时间段、光线条件、空间结构和氛围要点。",
  "同一地点和同一时间语境应尽量复用同一 sceneKey，不要把同场景拆成很多近义名字。",
  "场景提示应服务连续出图，重点写清建筑语言、陈设、材质、天气、色温和空间尺度。",
].join("\n");

export const LIBTV_STORYBOARD_BREAKDOWN_GUIDELINES = [
  "每个镜头聚焦单一叙事动作，镜头顺序必须忠于原剧本事件顺序。",
  "每行分镜都要能映射回角色、场景、动作、情绪、对白或视觉结果中的至少一项原文依据。",
  "若镜头能绑定已有角色或场景，必须回填稳定 characterKeys / sceneKey，而不是只留自然语言描述。",
  "image prompt 强调单帧构图，motion prompt 强调时间推进、动作变化与运镜节奏。",
].join("\n");

export const LIBTV_VIDEO_PROMPT_TAG_GUIDELINES = [
  "视频动作描述尽量显式标出场景与角色主体，保持连续动作切分。",
  "需要时可使用 <location>场景</location>、<role>角色</role>、<voice>旁白主体</voice> 这类稳定标签帮助模型绑定主体。",
  "多段动作建议按 0-3 秒、3-6 秒这类节奏拆分，避免把多个动作揉成一段模糊描述。",
].join("\n");

export const LIBTV_CANONICAL_ASSET_RULES = [
  "同一 characterKeys 的镜头必须继承同一角色外观锚点，包括发型、服饰、材质、配饰、体态与气质。",
  "同一 sceneKey 的镜头必须继承同一空间设定，包括时代、建筑、陈设、天气、时间段、色温与光线方向。",
  "当存在明确参考图时，优先复用与该角色键或场景键匹配的 canonical reference，不得只取其模糊氛围。",
  "除非脚本明确要求切换时空、媒介、形态或风格域，否则禁止在不同视觉媒介、世界观、时代语境、主体形态或美术体系之间随机漂移。",
].join("\n");

export function toLibTvCharacterKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function normalizeLibTvSceneKey(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[，,]+/g, "、")
    .trim();
}

export function truncateLibTvText(value: unknown, max = 120) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function dedupeLibTvStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const list: string[] = [];

  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push(normalized);
  }

  return list;
}

const LIBTV_SCENE_NOISE_PATTERN =
  /(画面构图|构图|镜头|机位|视角|景别|远景|全景|中景|近景|特写|大特写|俯拍|仰拍|平视|侧拍|背拍|推镜|拉镜|摇镜|跟拍|跟镜|移镜|固定镜头|手持|焦距|景深|光影|灯光|氛围|微表情|人物空间|主体动作|角色动作|情绪|对白|音效|音乐|技术参数|视觉风格|无人物|无互动|时长|秒|f\/?\d+\.?\d*|mm镜头)/gi;

function normalizeLibTvSceneCandidate(value: unknown) {
  return normalizeLibTvSceneKey(value)
    .replace(LIBTV_SCENE_NOISE_PATTERN, " ")
    .replace(/[【】[\]（）()“”"']/g, " ")
    .replace(/[。；;，,、|｜:：]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeLibTvScene(value: unknown) {
  const text = normalizeLibTvSceneCandidate(value);
  if (!text) return [];
  const ascii = text.match(/[a-zA-Z0-9][a-zA-Z0-9_-]{1,}/g) || [];
  const cjk = text.match(/[\u4e00-\u9fff]{2,8}/g) || [];
  return Array.from(
    new Set([...ascii, ...cjk].map((item) => item.toLowerCase())),
  );
}

function scoreLibTvSceneSimilarity(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  setA.forEach((item) => {
    if (setB.has(item)) intersection += 1;
  });
  return intersection / Math.max(setA.size, setB.size);
}

function inferLibTvSceneAssetKey(
  row: LibTvStoryboardScriptRow,
  profiles: Map<string, LibTvStoryboardSceneProfile>,
) {
  const explicit = normalizeLibTvSceneCandidate(
    row.sceneAssetKey || row.sceneKey,
  );
  if (explicit && explicit.length <= 28) return explicit;

  const candidates = [row.sceneTags]
    .map(normalizeLibTvSceneCandidate)
    .filter(Boolean);
  const bestCandidate = candidates
    .map((text) => text.split(/\s+/).filter(Boolean).slice(0, 4).join(" "))
    .find((text) => text.length >= 2);
  const fallback = truncateLibTvText(
    bestCandidate || row.sceneTags || row.sceneKey || row.sceneAssetKey,
    18,
  );
  if (!fallback) return "";
  const fallbackTokens = tokenizeLibTvScene(candidates.join(" "));

  let bestKey = "";
  let bestScore = 0;
  profiles.forEach((profile, key) => {
    const score = scoreLibTvSceneSimilarity(
      fallbackTokens,
      tokenizeLibTvScene(`${profile.key} ${profile.description}`),
    );
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  });
  if (bestKey && bestScore >= 0.42) return bestKey;
  return normalizeLibTvSceneKey(fallback);
}

export function deriveLibTvSceneProfiles(
  rows: LibTvStoryboardScriptRow[],
): LibTvStoryboardSceneProfile[] {
  const profiles = new Map<string, LibTvStoryboardSceneProfile>();

  rows.forEach((row) => {
    const key = inferLibTvSceneAssetKey(row, profiles);
    if (!key) return;

    const description = [
      key,
      normalizeLibTvSceneKey(row.sceneTags),
      truncateLibTvText(row.lightingAtmosphere, 48),
    ]
      .filter(Boolean)
      .join("；");

    if (!description) return;

    const current = profiles.get(key);
    if (!current) {
      profiles.set(key, {
        key,
        description,
        location: key,
        atmosphere: truncateLibTvText(
          row.lightingAtmosphere || row.sceneTags,
          80,
        ),
        environmentPrompt: description,
      });
      return;
    }

    const merged = dedupeLibTvStrings([
      ...String(current.description || "").split("；"),
      ...description.split("；"),
    ]).slice(0, 4);

    profiles.set(key, {
      ...current,
      description: merged.join("；"),
      environmentPrompt: merged.join("；"),
    });
  });

  return [...profiles.values()].slice(0, 12);
}

export function formatLibTvCharacterProfiles(profiles: CharacterProfileLike[]) {
  if (profiles.length === 0) return "无";

  return profiles
    .map((profile) => {
      const aliases =
        Array.isArray(profile.aliases) && profile.aliases.length > 0
          ? `（别名：${profile.aliases.join("、")}）`
          : "";
      return `- ${profile.name}${aliases}${profile.description ? `：${profile.description}` : ""}`;
    })
    .join("\n");
}

export function formatLibTvSceneProfiles(profiles: SceneProfileLike[]) {
  if (profiles.length === 0) return "无";

  return profiles
    .map(
      (profile) =>
        `- ${profile.key}${profile.description ? `：${profile.description}` : ""}`,
    )
    .join("\n");
}

function extractExplicitVisualStyleText(result: LibTvStoryboardScriptResult) {
  const sources = [
    result.userPrompt,
    result.sourceScript,
    ...(Array.isArray(result.rows)
      ? result.rows.flatMap((row) => [
          row.storyboardPrompt,
          row.visualDescription,
          row.sceneTags,
          row.lightingAtmosphere,
        ])
      : []),
  ]
    .map((item) => String(item || ""))
    .filter(Boolean);

  for (const source of sources) {
    const matched = source.match(
      /[［\[]\s*视觉风格\s*[：:]\s*([^\]］\n]+)[\]］]/i,
    );
    const value = truncateLibTvText(matched?.[1], 80);
    if (value) return value;
  }

  return "";
}

function inferVisualMediumLock(result: LibTvStoryboardScriptResult) {
  const rowPromptText = (Array.isArray(result.rows) ? result.rows : [])
    .map((row) =>
      [
        row.visualDescription,
        row.storyboardPrompt,
        row.motionPrompt,
        row.sceneTags,
        row.lightingAtmosphere,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  const text =
    `${result.title}\n${result.summary}\n${result.userPrompt}\n${result.sourceScript}\n${rowPromptText}`.toLowerCase();
  const explicitStyleText = extractExplicitVisualStyleText(result);

  if (explicitStyleText) {
    return `视觉媒介锁定：全片统一遵循脚本/分镜提示词中的显式视觉风格「${explicitStyleText}」。必须把角色、场景、材质、光影和镜头语言都转译到该美术体系内，禁止输出与该风格域冲突的媒介、质感或渲染语言。`;
  }

  if (
    /(3d|三维|cg|c4d|blender|pixar|皮克斯|卡通渲染|动画质感)/i.test(text) &&
    /(漫画|条漫|动漫|二次元|anime|manga|comic|illustration|插画|夸张)/i.test(
      text,
    )
  ) {
    return "视觉媒介锁定：全片统一为脚本指定的复合视觉媒介与单一美术语言；必须保持同一材质逻辑、体积语言、表情夸张度和渲染方式，禁止切成与脚本风格域冲突的其他媒介。";
  }

  if (
    /(漫画|条漫|动漫|二次元|anime|manga|comic|illustration|插画)/i.test(text)
  ) {
    return "视觉媒介锁定：全片统一为脚本指定的绘制型视觉媒介，禁止突然切成其他不兼容的摄影、渲染或图形媒介。";
  }
  if (/(3d|三维|cg|c4d|blender|pixar|卡通渲染)/i.test(text)) {
    return "视觉媒介锁定：全片统一为脚本指定的三维/渲染型视觉媒介，禁止突然切成其他不兼容的摄影、绘制或材质语言。";
  }
  if (
    /(写实|真人|实拍|电影|影视|live action|photoreal|cinematic)/i.test(text)
  ) {
    return "视觉媒介锁定：全片统一为脚本指定的影像化视觉媒介，禁止突然切成其他不兼容的绘制、渲染或风格化媒介。";
  }

  return "视觉媒介锁定：若脚本未明确指定风格，必须先根据题材、受众和世界观选定一种单一默认美术体系；一旦确定媒介后，全片禁止在不兼容的视觉媒介、材质逻辑和渲染语言之间来回切换。";
}

function inferWorldLock(result: LibTvStoryboardScriptResult) {
  void result;
  return "世界观/时代锁定：全片必须共享同一世界规则、时间语境、空间文明、技术水平、社会结构和美术设定。若脚本包含多时空、多世界、多身份层或回忆/梦境/虚拟层，只能在脚本明确标注的镜头中切换；当前镜头必须严格停留在该镜头所属的世界观层级，不得把其他层级的元素误带入。";
}

export function buildLibTvContinuityPackage(
  result: LibTvStoryboardScriptResult,
  sceneProfiles: SceneProfileLike[],
): LibTvContinuityPackage {
  const sceneSummary =
    sceneProfiles.length > 0
      ? `场景锚点优先复用以下空间与氛围：${sceneProfiles
          .slice(0, 6)
          .map((item) => item.key)
          .join(
            "、",
          )}。同一场景再次出现时，建筑结构、陈设、材质、光线、时间段和天气氛围必须连续，只允许镜头角度与局部动作变化。`
      : "场景锚点：同一场景再次出现时，建筑结构、陈设、材质、光线、时间段和天气氛围必须连续，只允许镜头角度与局部动作变化。";

  return {
    visualMediumLock: inferVisualMediumLock(result),
    worldLock: inferWorldLock(result),
    sceneLock: sceneSummary,
    styleLock:
      "风格总锁：全批次只允许一种统一美术语言、线条/体积语言、材质逻辑、渲染方式和色彩系统。除非脚本明确指定风格变化，否则所有镜头都要保持同一审美体系，不得在不兼容的视觉体系之间跳变。",
    wardrobeLock:
      "造型连续性锁定：同一角色默认沿用其 canonical 角色资产中的基础造型体系、主色、材质、发型/头部特征、配饰与标志性元素。只有当格式化剧本或当前镜头明确写出造型状态变化、身份伪装、形态变化、环境造成的外观变化或剧情驱动的装束变化时，才允许改变造型；未明确写出时，一律不得自行更换。",
    prohibitedDrifts: [
      "禁止角色跨镜头无依据地更换身份主体、脸部锚点、年龄感、体型结构、造型体系、头部特征、标志性配饰或主色。",
      "禁止同一角色在不同镜头里无依据地切换视觉媒介、主体形态、文化语境或风格域。",
      "禁止场景无依据地更换世界观层级、地理空间、建筑/空间语言、时间段、天气、技术水平或文明体系。",
      "禁止把参考图只当氛围图，凡是参考图里已确定的人物身份、造型、道具、材质和空间信息都必须优先继承。",
    ],
  };
}
