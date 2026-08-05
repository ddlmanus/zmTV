export type LibTvStoryboardScriptColumnKey =
  | "shotNumber"
  | "startTime"
  | "endTime"
  | "duration"
  | "visualDescription"
  | "narrativeContent"
  | "character1"
  | "characterDescription1"
  | "characterImage1"
  | "character2"
  | "characterDescription2"
  | "characterImage2"
  | "referenceImage"
  | "shotType"
  | "cameraAngle"
  | "cameraMovement"
  | "focalDepth"
  | "characterAction"
  | "emotion"
  | "sceneTags"
  | "lightingAtmosphere"
  | "musicRhythm"
  | "voice"
  | "soundEffect"
  | "dialogue"
  | "subtitleText"
  | "subtitleStartTime"
  | "subtitleEndTime"
  | "storyboardPrompt"
  | "motionPrompt"

export interface LibTvStoryboardScriptRow {
  shotNumber: string
  characters?: Array<{
    characterName?: string
    characterDescription?: string
    characterImageUrl?: string
    [key: string]: unknown
  }>
  startTime?: string
  endTime?: string
  duration: string
  visualDescription: string
  narrativeContent?: string
  character1: string
  characterKeys?: string[]
  characterAssetId1?: string
  characterPersonaKey1?: string
  characterDescription1: string
  characterImage1: string
  wardrobeOverride1?: string
  character2: string
  characterAssetId2?: string
  characterPersonaKey2?: string
  characterDescription2: string
  characterImage2: string
  wardrobeOverride2?: string
  referenceImage: string
  sceneKey?: string
  sceneAssetKey?: string
  props?: unknown
  propNames?: unknown
  propKeys?: unknown
  usedProps?: unknown
  objects?: unknown
  objectNames?: unknown
  shotType: string
  cameraAngle?: string
  cameraMovement?: string
  focalDepth?: string
  characterAction: string
  emotion: string
  sceneTags: string
  lightingAtmosphere: string
  musicRhythm?: string
  voice?: string
  soundEffect: string
  dialogue: string
  subtitleText?: string
  subtitleStartTime?: string
  subtitleEndTime?: string
  subtitleSpeaker?: string
  imageGenerationPrompt?: string
  videoMotionPrompt?: string
  storyboardPrompt: string
  motionPrompt: string
}

export interface LibTvStoryboardCharacterProfile {
  name: string
  description: string
  aliases?: string[]
  roleType?: string
  appearance?: string
  personality?: string
  background?: string
}

export interface LibTvStoryboardCharacterAsset {
  id?: string
  characterKey: string
  personaKey: string
  name: string
  variantLabel: string
  description: string
  identityPrompt: string
  facialFeatures?: string
  skinTone?: string
  hairStyle?: string
  bodyType?: string
  outfit?: string
  accessories?: string
  referenceImageUrl?: string
  referenceImageUrls?: string[]
  source?: "user-upload" | "generated-canonical" | "upstream-reference" | "mixed"
  generatedAt?: number
}

export interface LibTvStoryboardSceneProfile {
  key: string
  description: string
  location?: string
  timeOfDay?: string
  atmosphere?: string
  environmentPrompt?: string
  props?: string
}

export interface LibTvStoryboardPropProfile {
  name: string
  type: string
  description: string
  imagePrompt?: string
}

export interface LibTvFormattedScreenplayScene {
  sceneNumber: string
  heading: string
  content: string
}

export interface LibTvStoryboardReviewIssue {
  shotNumber?: string
  severity?: string
  problem: string
  fixInstruction: string
}

export interface LibTvStoryboardReviewRecord {
  agentId: string
  label: string
  approved: boolean
  score: number
  summary?: string
  rewriteBrief?: string
  issues: LibTvStoryboardReviewIssue[]
}

export interface LibTvStoryboardScriptResult {
  title: string
  summary: string
  sourceScript: string
  userPrompt: string
  selectedOptionId: string
  formattedScreenplay?: string
  formattedScreenplayScenes?: LibTvFormattedScreenplayScene[]
  characterProfiles?: LibTvStoryboardCharacterProfile[]
  characterAssets?: LibTvStoryboardCharacterAsset[]
  sceneProfiles?: LibTvStoryboardSceneProfile[]
  propProfiles?: LibTvStoryboardPropProfile[]
  reviewRecords?: LibTvStoryboardReviewRecord[]
  rows: LibTvStoryboardScriptRow[]
  generatedAt: number
}

export type LibTvScriptV2AssetKind = "角色" | "场景" | "道具"

export interface LibTvScriptV2AssetItem {
  id: string
  kind: LibTvScriptV2AssetKind
  title: string
  imageUrl: string
  prompt: string
  modelId: string
  aspectRatio?: string
  imageSize?: string
  quality?: string
  generationJobId?: string
  generationTaskId?: string
  generationTaskType?: string
  generationProviderKey?: string
  generationError?: string
  assetStage?: string
  personaId?: string
  reviewStatus?: "pending" | "approved" | "rejected"
  reviewedAt?: string
  sourceNodeId?: string
  cleanPlate?: boolean
  createdAt: number
}

export type LibTvScriptV2AssetsByKind = Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]>

const LIBTV_STORYBOARD_PROMPT_ALIASES = [
  "storyboardPrompt",
  "storyboard_prompt",
  "imageGenerationPrompt",
  "image_generation_prompt",
  "imagePrompt",
  "image_prompt",
  "visualPrompt",
  "visual_prompt",
  "drawing_prompt",
  "prompt_text",
  "分镜提示词",
  "绘图提示词",
  "图片提示词",
  "生图提示词",
  "画面提示词",
  "图像提示词",
]

const LIBTV_MOTION_PROMPT_ALIASES = [
  "motionPrompt",
  "motion_prompt",
  "videoMotionPrompt",
  "video_motion_prompt",
  "videoPrompt",
  "video_prompt",
  "cameraMovement",
  "camera_movement",
  "cameraMotion",
  "camera_motion",
  "movement",
  "motion",
  "视频运动提示词",
  "视频提示词",
  "视频运镜提示词",
  "运镜提示词",
  "动态提示词",
  "运镜",
  "镜头运动",
]

const LIBTV_REFERENCE_IMAGE_ALIASES = [
  "referenceImage",
  "reference_image",
  "referenceFrameImage",
  "reference_frame_image",
  "video_reference.reference_frame_image",
  "videoReference.referenceFrameImage",
  "参考图",
  "视频参考图",
]

const LIBTV_VISUAL_DESCRIPTION_ALIASES = [
  "visualDescription",
  "visual_description",
  "plotDescription",
  "plot_description",
  "sceneDescription",
  "scene_description",
  "shotDescription",
  "shot_description",
  "description",
  "content",
  "画面描述",
  "镜头描述",
  "画面内容",
]

const LIBTV_DURATION_ALIASES = [
  "duration",
  "durationSeconds",
  "duration_seconds",
  "duration_sec",
  "time",
  "时长",
]

const LIBTV_START_TIME_ALIASES = [
  "startTime",
  "start_time",
  "start",
  "startSeconds",
  "start_seconds",
  "起始时间",
  "开始时间",
  "起始节点",
]

const LIBTV_END_TIME_ALIASES = [
  "endTime",
  "end_time",
  "end",
  "endSeconds",
  "end_seconds",
  "结束时间",
]

const LIBTV_NARRATIVE_ALIASES = [
  "narrativeContent",
  "narrative_content",
  "narrative",
  "plot",
  "story",
  "叙事内容",
  "剧情内容",
]

const LIBTV_SHOT_TYPE_ALIASES = [
  "shotType",
  "shot_type",
  "shotSize",
  "shot_size",
  "cameraShot",
  "camera_shot",
  "camera",
  "framing",
  "景别",
  "镜头类型",
]

const LIBTV_CAMERA_ANGLE_ALIASES = [
  "cameraAngle",
  "camera_angle",
  "angle",
  "摄像机角度",
  "摄影机角度",
  "机位",
]

const LIBTV_CAMERA_MOVEMENT_ALIASES = [
  "cameraMovement",
  "camera_movement",
  "cameraMotion",
  "camera_motion",
  "movement",
  "motion",
  "运镜",
  "镜头运动",
  "摄影机运动",
  "摄像机运动",
]

const LIBTV_FOCAL_DEPTH_ALIASES = [
  "focalDepth",
  "focal_depth",
  "focalLengthAndDepth",
  "focal_length_and_depth",
  "lens",
  "depthOfField",
  "depth_of_field",
  "焦距与景深",
  "焦距",
  "景深",
]

const LIBTV_CHARACTER_ACTION_ALIASES = [
  "characterAction",
  "character_action",
  "action",
  "action_description",
  "main_action",
  "performance",
  "动作",
  "人物动作",
]

const LIBTV_EMOTION_ALIASES = [
  "emotion",
  "mood",
  "tone",
  "feeling",
  "情绪",
  "表情",
]

const LIBTV_SCENE_TAG_ALIASES = [
  "sceneTags",
  "scene_tags",
  "tags",
  "location",
  "setting",
  "environment",
  "场景标签",
  "场景",
]

const LIBTV_LIGHTING_ALIASES = [
  "lightingAtmosphere",
  "lighting_atmosphere",
  "lightingAndAtmosphere",
  "lighting_and_atmosphere",
  "lighting",
  "atmosphere",
  "光影氛围",
  "光线氛围",
]

const LIBTV_SOUND_ALIASES = [
  "soundEffect",
  "sound_effect",
  "audioEffects",
  "audio_effects",
  "sound",
  "audio",
  "sfx",
  "music",
  "音效",
  "声音",
]

const LIBTV_MUSIC_RHYTHM_ALIASES = [
  "musicRhythm",
  "music_rhythm",
  "music",
  "rhythm",
  "beat",
  "音乐节奏",
  "音乐",
  "节奏",
]

const LIBTV_VOICE_ALIASES = [
  "voice",
  "voiceover",
  "voice_over",
  "speech",
  "humanVoice",
  "human_voice",
  "人声",
  "旁白",
  "对白",
  "台词",
]

const LIBTV_DIALOGUE_ALIASES = [
  "dialogue",
  "line",
  "lines",
  "voiceover",
  "voice_over",
  "narration",
  "旁白",
  "对白",
  "台词",
]

const LIBTV_SUBTITLE_TEXT_ALIASES = [
  "subtitleText",
  "subtitle_text",
  "captionText",
  "caption_text",
  "subtitles",
  "captions",
  "字幕文本",
  "字幕",
]

const LIBTV_SUBTITLE_START_ALIASES = [
  "subtitleStartTime",
  "subtitle_start_time",
  "captionStartTime",
  "caption_start_time",
  "字幕开始时间",
]

const LIBTV_SUBTITLE_END_ALIASES = [
  "subtitleEndTime",
  "subtitle_end_time",
  "captionEndTime",
  "caption_end_time",
  "字幕结束时间",
]

function isLibTvRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function getLibTvNestedValue(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isLibTvRecord(current)) return undefined
    return current[segment]
  }, source)
}

function normalizeLibTvAliasKey(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "")
}

function getFirstLibTvAliasedString(source: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const value = getLibTvNestedValue(source, alias)
    if (typeof value === "string" && value.trim() && value.trim() !== "-") return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }

  const aliasKeys = aliases.map(normalizeLibTvAliasKey)
  const stack: unknown[] = [source]
  const seen = new Set<unknown>()
  while (stack.length > 0) {
    const current = stack.shift()
    if (!isLibTvRecord(current) || seen.has(current)) continue
    seen.add(current)
    for (const [key, value] of Object.entries(current)) {
      if (aliasKeys.includes(normalizeLibTvAliasKey(key))) {
        if (typeof value === "string" && value.trim() && value.trim() !== "-") return value.trim()
        if (typeof value === "number" && Number.isFinite(value)) return String(value)
      }
      if (isLibTvRecord(value)) stack.push(value)
    }
  }
  return ""
}

function cleanLibTvScriptValue(value: unknown) {
  const text = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : String(value || "").trim()
  return text === "-" ? "" : text
}

const LIBTV_VIDEO_MOTION_PROMPT_ALIASES = [
  "videoMotionPrompt",
  "video_motion_prompt",
  "finalVideoMotionPrompt",
  "final_video_motion_prompt",
  "motionPrompt",
  "motion_prompt",
  "videoPrompt",
  "video_prompt",
  "最终视频运动提示词",
  "视频运动提示词",
  "视频运镜提示词",
  "视频提示词",
  "动态提示词",
  "运镜提示词",
]

export function resolveLibTvStoryboardVideoMotionPrompt(row: Partial<LibTvStoryboardScriptRow> | Record<string, unknown> | undefined, fallback = "") {
  if (!row || typeof row !== "object") return cleanLibTvScriptValue(fallback)
  const record = row as Record<string, unknown>
  const direct = getFirstLibTvAliasedString(record, LIBTV_VIDEO_MOTION_PROMPT_ALIASES)
  if (direct) return direct

  const textCandidates = [
    record.storyboardPrompt,
    record.finalPrompt,
    record.final_prompt,
    record.prompt,
    record.content,
  ]
  for (const candidate of textCandidates) {
    const text = cleanLibTvScriptValue(candidate)
    if (!text) continue
    const parsed = parseLibTvJsonObjectFromText(text)
    if (parsed) {
      const parsedPrompt = getFirstLibTvAliasedString(parsed, LIBTV_VIDEO_MOTION_PROMPT_ALIASES)
      if (parsedPrompt) return parsedPrompt
    }
    const quoted = text.match(/["“']?(?:videoMotionPrompt|video_motion_prompt|finalVideoMotionPrompt|final_video_motion_prompt|最终视频运动提示词|视频运动提示词|视频运镜提示词|视频提示词|动态提示词|运镜提示词)["”']?\s*[:：]\s*["“]?([\s\S]*?)(?=["”']?\s*(?:[,，}\n]|$))/i)
    if (quoted?.[1]) return quoted[1].replace(/["”]+$/g, "").trim()
  }

  return cleanLibTvScriptValue(fallback)
}

function parseLibTvJsonObjectFromText(value: string): Record<string, unknown> | null {
  const text = String(value || "").trim()
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = String(fenced?.[1] || text).trim()
  try {
    const parsed = JSON.parse(candidate)
    return isLibTvRecord(parsed) ? parsed : null
  } catch {
    // Continue with brace extraction below.
  }
  return parseLastLibTvJsonObjectFromMixedText(candidate)
}

function parseLastLibTvJsonObjectFromMixedText(text: string): Record<string, unknown> | null {
  const values: Record<string, unknown>[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{") continue
    const candidate = extractLibTvJsonObjectCandidate(text, index)
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (isLibTvRecord(parsed)) values.push(parsed)
      index += candidate.length - 1
    } catch {
      // Continue scanning mixed stdout / logs.
    }
  }
  return values.length > 0 ? values[values.length - 1] || null : null
}

function extractLibTvJsonObjectCandidate(text: string, startIndex: number) {
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === "\"") inString = false
      continue
    }
    if (char === "\"") {
      inString = true
      continue
    }
    if (char === "{") {
      stack.push("}")
      continue
    }
    if (char === "}") {
      const expected = stack.pop()
      if (expected !== "}") return ""
      if (stack.length === 0) return text.slice(startIndex, index + 1)
    }
  }
  return ""
}

function getLibTvFirstArray(source: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = getLibTvNestedValue(source, path)
    if (Array.isArray(value) && value.length > 0) return value
  }
  return []
}

function extractLibTvTextPayloads(source: Record<string, unknown>) {
  const texts: string[] = []
  const push = (value: unknown) => {
    const text = String(value || "").trim()
    if (text) texts.push(text)
  }
  const taskTexts = getLibTvFirstArray(source, ["task_result.texts", "data.task_result.texts", "result.task_result.texts"])
  taskTexts.forEach(push)
  const contentItems = getLibTvFirstArray(source, ["content", "data.content", "result.content"])
  contentItems.forEach((item) => {
    if (typeof item === "string") {
      push(item)
      return
    }
    if (isLibTvRecord(item)) push(item.text)
  })
  return texts
}

function extractLibTvStoryboardEntries(source: Record<string, unknown>) {
  for (const path of [
    "rows",
    "shots",
    "shot_scripts",
    "shotScripts",
    "storyboard_rows",
    "storyboardRows",
    "storyboard",
    "storyboards",
    "storyboard_script",
    "storyboardScript",
    "storyboard_items",
    "storyboardItems",
    "script_rows",
    "scriptRows",
    "scripts",
    "segments",
    "frames",
    "clips",
    "beats",
    "data.rows",
    "data.shots",
    "result.rows",
    "result.shots",
    "output.rows",
    "output.shots",
  ]) {
    const entries = getLibTvFirstArray(source, [path])
    if (entries.length > 0) return entries
  }
  return []
}

function getLibTvCharacterProfileFromShot(record: Record<string, unknown>, index: number) {
  const characters = Array.isArray(record.characters) ? record.characters : []
  const character = characters[index]
  if (!isLibTvRecord(character)) return { name: "", description: "", image: "" }
  return {
    name: getFirstLibTvAliasedString(character, ["character_name", "name", "character", "role", `角色${index + 1}`]),
    description: getFirstLibTvAliasedString(character, ["character_description", "description", "appearance", "profile", `角色描述${index + 1}`]),
    image: getFirstLibTvAliasedString(character, ["character_image_url", "characterImage", "character_image", "image", "image_url", `角色图${index + 1}`]),
  }
}

function normalizeLibTvStoryboardRow(row: LibTvStoryboardScriptRow | Record<string, unknown>, index: number): LibTvStoryboardScriptRow {
  const record = isLibTvRecord(row) ? row : {}
  const character1 = getLibTvCharacterProfileFromShot(record, 0)
  const character2 = getLibTvCharacterProfileFromShot(record, 1)
  const visualDescription = cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).visualDescription)
    || getFirstLibTvAliasedString(record, LIBTV_VISUAL_DESCRIPTION_ALIASES)
  const characterAction = cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterAction)
    || getFirstLibTvAliasedString(record, LIBTV_CHARACTER_ACTION_ALIASES)
    || visualDescription
  const sceneTags = cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).sceneTags)
    || getFirstLibTvAliasedString(record, LIBTV_SCENE_TAG_ALIASES)
  return {
    ...(row as LibTvStoryboardScriptRow),
    shotNumber: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).shotNumber)
      || cleanLibTvScriptValue(record.shot_number)
      || cleanLibTvScriptValue(record.index)
      || String(index + 1),
    startTime: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).startTime)
      || getFirstLibTvAliasedString(record, LIBTV_START_TIME_ALIASES),
    endTime: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).endTime)
      || getFirstLibTvAliasedString(record, LIBTV_END_TIME_ALIASES),
    duration: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).duration)
      || getFirstLibTvAliasedString(record, LIBTV_DURATION_ALIASES),
    visualDescription,
    narrativeContent: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).narrativeContent)
      || getFirstLibTvAliasedString(record, LIBTV_NARRATIVE_ALIASES),
    character1: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).character1)
      || getFirstLibTvAliasedString(record, ["character1", "character", "role", "subject", "角色1"])
      || character1.name,
    characterAssetId1: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterAssetId1)
      || getFirstLibTvAliasedString(record, ["characterAssetId1", "character_asset_id1", "characterAssetId", "character_asset_id", "characterId1", "character_id1", "assetId1", "asset_id1", "角色资产ID1"]),
    characterPersonaKey1: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterPersonaKey1)
      || getFirstLibTvAliasedString(record, ["characterPersonaKey1", "character_persona_key1", "personaKey1", "persona_key1", "personaKey", "persona_key", "角色Key1"]),
    characterDescription1: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterDescription1)
      || getFirstLibTvAliasedString(record, ["characterDescription1", "character_description1", "characterDescription", "character_description", "appearance", "角色描述1"])
      || character1.description,
    characterImage1: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterImage1)
      || getFirstLibTvAliasedString(record, ["characterImage1", "character_image1", "characterImage", "character_image", "人物图1", "角色图1"])
      || character1.image,
    character2: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).character2)
      || getFirstLibTvAliasedString(record, ["character2", "secondaryCharacter", "secondary_character", "role2", "角色2"])
      || character2.name,
    characterAssetId2: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterAssetId2)
      || getFirstLibTvAliasedString(record, ["characterAssetId2", "character_asset_id2", "secondaryCharacterAssetId", "secondary_character_asset_id", "characterId2", "character_id2", "assetId2", "asset_id2", "角色资产ID2"]),
    characterPersonaKey2: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterPersonaKey2)
      || getFirstLibTvAliasedString(record, ["characterPersonaKey2", "character_persona_key2", "secondaryCharacterPersonaKey", "secondary_character_persona_key", "personaKey2", "persona_key2", "角色Key2"]),
    characterDescription2: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterDescription2)
      || getFirstLibTvAliasedString(record, ["characterDescription2", "character_description2", "secondaryCharacterDescription", "secondary_character_description", "角色描述2"])
      || character2.description,
    characterImage2: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).characterImage2)
      || getFirstLibTvAliasedString(record, ["characterImage2", "character_image2", "secondaryCharacterImage", "secondary_character_image", "人物图2", "角色图2"])
      || character2.image,
    referenceImage: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).referenceImage) || getFirstLibTvAliasedString(record, LIBTV_REFERENCE_IMAGE_ALIASES),
    shotType: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).shotType) || getFirstLibTvAliasedString(record, LIBTV_SHOT_TYPE_ALIASES),
    cameraAngle: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).cameraAngle) || getFirstLibTvAliasedString(record, LIBTV_CAMERA_ANGLE_ALIASES),
    cameraMovement: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).cameraMovement) || getFirstLibTvAliasedString(record, LIBTV_CAMERA_MOVEMENT_ALIASES),
    focalDepth: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).focalDepth) || getFirstLibTvAliasedString(record, LIBTV_FOCAL_DEPTH_ALIASES),
    characterAction,
    emotion: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).emotion) || getFirstLibTvAliasedString(record, LIBTV_EMOTION_ALIASES),
    sceneTags,
    sceneKey: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).sceneKey) || sceneTags,
    sceneAssetKey: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).sceneAssetKey) || sceneTags,
    lightingAtmosphere: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).lightingAtmosphere) || getFirstLibTvAliasedString(record, LIBTV_LIGHTING_ALIASES),
    musicRhythm: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).musicRhythm) || getFirstLibTvAliasedString(record, LIBTV_MUSIC_RHYTHM_ALIASES),
    voice: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).voice) || getFirstLibTvAliasedString(record, LIBTV_VOICE_ALIASES),
    soundEffect: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).soundEffect) || getFirstLibTvAliasedString(record, LIBTV_SOUND_ALIASES),
    dialogue: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).dialogue) || getFirstLibTvAliasedString(record, LIBTV_DIALOGUE_ALIASES),
    subtitleText: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).subtitleText) || getFirstLibTvAliasedString(record, LIBTV_SUBTITLE_TEXT_ALIASES),
    subtitleStartTime: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).subtitleStartTime) || getFirstLibTvAliasedString(record, LIBTV_SUBTITLE_START_ALIASES),
    subtitleEndTime: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).subtitleEndTime) || getFirstLibTvAliasedString(record, LIBTV_SUBTITLE_END_ALIASES),
    subtitleSpeaker: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).subtitleSpeaker)
      || getFirstLibTvAliasedString(record, ["subtitleSpeaker", "subtitle_speaker", "captionSpeaker", "caption_speaker", "字幕说话人"]),
    imageGenerationPrompt: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).imageGenerationPrompt)
      || getFirstLibTvAliasedString(record, ["imageGenerationPrompt", "image_generation_prompt", "finalImagePrompt", "final_image_prompt", "最终生图提示词", "图片生成提示词"]),
    videoMotionPrompt: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).videoMotionPrompt)
      || getFirstLibTvAliasedString(record, ["videoMotionPrompt", "video_motion_prompt", "finalVideoMotionPrompt", "final_video_motion_prompt", "最终视频运动提示词"]),
    storyboardPrompt: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).storyboardPrompt) || getFirstLibTvAliasedString(record, LIBTV_STORYBOARD_PROMPT_ALIASES),
    motionPrompt: cleanLibTvScriptValue((row as LibTvStoryboardScriptRow).motionPrompt) || getFirstLibTvAliasedString(record, LIBTV_MOTION_PROMPT_ALIASES),
  }
}

export function normalizeLibTvStoryboardScriptResult(input: unknown): LibTvStoryboardScriptResult | null {
  if (!input || typeof input !== "object") return null
  const inputRecord = input as Record<string, unknown>
  const textPayloads = extractLibTvTextPayloads(inputRecord)
  for (let index = textPayloads.length - 1; index >= 0; index -= 1) {
    const parsed = parseLibTvJsonObjectFromText(textPayloads[index] || "")
    const normalized = parsed ? normalizeLibTvStoryboardScriptResult(parsed) : null
    if (normalized?.rows?.length) return normalized
  }

  const entries = extractLibTvStoryboardEntries(inputRecord)
  if (entries.length === 0) return input as LibTvStoryboardScriptResult

  const meta = isLibTvRecord(inputRecord.meta) ? inputRecord.meta : null
  const rows = entries
    .map((row, index) => normalizeLibTvStoryboardRow(row as LibTvStoryboardScriptRow | Record<string, unknown>, index))
    .filter((row) => Object.values(row).some((value) => String(value || "").trim()))

  return {
    ...(input as LibTvStoryboardScriptResult),
    title: cleanLibTvScriptValue((input as LibTvStoryboardScriptResult).title)
      || getFirstLibTvAliasedString(meta || inputRecord, ["title", "name", "标题"])
      || "镜头脚本",
    summary: cleanLibTvScriptValue((input as LibTvStoryboardScriptResult).summary)
      || getFirstLibTvAliasedString(meta || inputRecord, ["summary", "synopsis", "theme", "description", "简介"]),
    sourceScript: cleanLibTvScriptValue((input as LibTvStoryboardScriptResult).sourceScript),
    userPrompt: cleanLibTvScriptValue((input as LibTvStoryboardScriptResult).userPrompt),
    selectedOptionId: cleanLibTvScriptValue((input as LibTvStoryboardScriptResult).selectedOptionId) || "storyboard-script",
    rows,
    generatedAt: Number.isFinite(Number((input as LibTvStoryboardScriptResult).generatedAt)) ? Number((input as LibTvStoryboardScriptResult).generatedAt) : Date.now(),
  }
}

export function splitLibTvCharacterNames(value: string) {
  return String(value || "")
    .split(/[、,，/\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeLibTvCharacterKey(value: string) {
  const raw = String(value || "").trim()
  if (!raw) return ""

  // Strip non-identity qualifiers so the same role does not fork into
  // different persona keys just because the shot says "(现代)" / "(古代)".
  const base = raw
    .replace(/[（(](现代|古代|古装|现代装|造型|形象|状态|成年|少年|青年|中年|老年|童年|幼年|战损|礼服|常服|朝服|制服|便装|白天|夜晚|夜间)[^)）]*[)）]/gi, " ")
    .trim()

  return base
    .toLowerCase()
    .replace(/\s+/g, "-")
}

export function inferLibTvCharacterVariantLabel(description: string) {
  const text = String(description || "").trim()
  if (!text) return "标准形象"

  if (/(唐代|大唐|官服|幞头|古装|宫廷|长安)/i.test(text)) return "古代造型"
  if (/(现代|职场|便装|办公室|西装|衬衫|都市)/i.test(text)) return "现代造型"
  if (/(校服|学生|校园)/i.test(text)) return "校园造型"
  if (/(战损|受伤|狼狈|破损)/i.test(text)) return "战损状态"
  if (/(礼服|盛装|婚纱|华服)/i.test(text)) return "礼服造型"

  const compact = text
    .replace(/[，。；：:、]/g, " ")
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ")

  return compact || "标准形象"
}

export function buildLibTvCharacterPersonaKey(name: string, _description: string) {
  const baseKey = normalizeLibTvCharacterKey(name)
  if (!baseKey) return ""
  return baseKey
}

export const LIBTV_STORYBOARD_SCRIPT_COLUMNS: Array<{
  key: LibTvStoryboardScriptColumnKey
  label: string
  width: number
  align?: "left" | "center"
}> = [
  { key: "shotNumber", label: "镜号", width: 50, align: "center" },
  { key: "startTime", label: "开始时间", width: 82, align: "center" },
  { key: "endTime", label: "结束时间", width: 82, align: "center" },
  { key: "duration", label: "时长", width: 80, align: "center" },
  { key: "visualDescription", label: "画面描述", width: 180 },
  { key: "narrativeContent", label: "叙事内容", width: 180 },
  { key: "character1", label: "人物1", width: 120, align: "center" },
  { key: "characterDescription1", label: "人物描述1", width: 180 },
  { key: "characterImage1", label: "人物图1", width: 80, align: "center" },
  { key: "character2", label: "人物2", width: 120, align: "center" },
  { key: "characterDescription2", label: "人物描述2", width: 180 },
  { key: "characterImage2", label: "人物图2", width: 80, align: "center" },
  { key: "referenceImage", label: "参考", width: 80, align: "center" },
  { key: "shotType", label: "景别", width: 120 },
  { key: "cameraAngle", label: "摄影机角度", width: 130 },
  { key: "cameraMovement", label: "摄影机运动", width: 150 },
  { key: "focalDepth", label: "焦距与景深", width: 140 },
  { key: "characterAction", label: "人物动作", width: 120 },
  { key: "emotion", label: "情绪", width: 120 },
  { key: "sceneTags", label: "场景标签", width: 120 },
  { key: "lightingAtmosphere", label: "光影氛围", width: 120 },
  { key: "musicRhythm", label: "音乐节奏", width: 130 },
  { key: "voice", label: "人声", width: 130 },
  { key: "soundEffect", label: "音效", width: 120 },
  { key: "dialogue", label: "对白", width: 120 },
  { key: "subtitleText", label: "字幕文本", width: 160 },
  { key: "subtitleStartTime", label: "字幕开始", width: 90, align: "center" },
  { key: "subtitleEndTime", label: "字幕结束", width: 90, align: "center" },
  { key: "storyboardPrompt", label: "分镜提示词", width: 180 },
  { key: "motionPrompt", label: "视频运动提示词", width: 180 },
]

export const LIBTV_STORYBOARD_SCRIPT_TABLE_MIN_WIDTH = LIBTV_STORYBOARD_SCRIPT_COLUMNS.reduce(
  (sum, column) => sum + column.width,
  0
)

export function createEmptyStoryboardScriptRow(index: number): LibTvStoryboardScriptRow {
  return {
    shotNumber: String(index + 1),
    startTime: "",
    endTime: "",
    duration: "",
    visualDescription: "",
    narrativeContent: "",
    character1: "",
    characterAssetId1: "",
    characterPersonaKey1: "",
    characterDescription1: "",
    characterImage1: "",
    wardrobeOverride1: "",
    character2: "",
    characterAssetId2: "",
    characterPersonaKey2: "",
    characterDescription2: "",
    characterImage2: "",
    wardrobeOverride2: "",
    referenceImage: "",
    sceneAssetKey: "",
    shotType: "",
    cameraAngle: "",
    cameraMovement: "",
    focalDepth: "",
    characterAction: "",
    emotion: "",
    sceneTags: "",
    lightingAtmosphere: "",
    musicRhythm: "",
    voice: "",
    soundEffect: "",
    dialogue: "",
    subtitleText: "",
    subtitleStartTime: "",
    subtitleEndTime: "",
    subtitleSpeaker: "",
    storyboardPrompt: "",
    motionPrompt: "",
  }
}

function pickFirstLibTvAssetText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanLibTvScriptValue(value)
    if (text) return text
  }
  return ""
}

function buildLibTvScriptV2AssetId(kind: LibTvScriptV2AssetKind, title: string, index: number, suffix = "") {
  const base = `${kind}-${index + 1}-${title || kind}-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return base || `${kind}-${index + 1}`
}

function collectLibTvScriptV2RowCharacterAssets(result: LibTvStoryboardScriptResult): LibTvScriptV2AssetItem[] {
  const rows = Array.isArray(result.rows) ? result.rows : []
  const byKey = new Map<string, LibTvScriptV2AssetItem>()
  const pushCharacter = (nameValue: unknown, descriptionValue?: unknown, imageValue?: unknown) => {
    const title = pickFirstLibTvAssetText(nameValue)
    if (!title) return
    const prompt = pickFirstLibTvAssetText(descriptionValue, title)
    const key = buildLibTvScriptV2AssetId("角色", title, byKey.size, buildLibTvCharacterPersonaKey(title, prompt) || title)
    if (byKey.has(key)) {
      const current = byKey.get(key)
      if (current && !current.imageUrl) {
        const imageUrl = pickFirstLibTvAssetText(imageValue)
        if (imageUrl) byKey.set(key, { ...current, imageUrl })
      }
      return
    }
    byKey.set(key, {
      id: key,
      kind: "角色",
      title,
      imageUrl: pickFirstLibTvAssetText(imageValue),
      prompt,
      modelId: "row-derived",
      createdAt: Number.isFinite(Number(result.generatedAt)) ? Number(result.generatedAt) : Date.now(),
    })
  }

  rows.forEach((row) => {
    const record = row as LibTvStoryboardScriptRow & Record<string, unknown>
    let usedStructuredCharacters = false
    if (Array.isArray(record.characters)) {
      record.characters.forEach((character) => {
        if (!isLibTvRecord(character)) return
        const name = getFirstLibTvAliasedString(character, ["characterName", "character_name", "name", "character", "role", "title"])
        if (!name) return
        usedStructuredCharacters = true
        pushCharacter(
          name,
          getFirstLibTvAliasedString(character, ["characterDescription", "character_description", "description", "appearance", "profile"]),
          getFirstLibTvAliasedString(character, ["characterImageUrl", "character_image_url", "imageUrl", "image_url", "image", "referenceImage"])
        )
      })
    }
    if (usedStructuredCharacters) return
    pushCharacter(record.character1, record.characterDescription1, record.characterImage1)
    pushCharacter(record.character2, record.characterDescription2, record.characterImage2)
  })

  return Array.from(byKey.values())
}

function mapLibTvScriptV2CharacterAssets(result: LibTvStoryboardScriptResult): LibTvScriptV2AssetItem[] {
  const assets = Array.isArray(result.characterAssets) && result.characterAssets.length > 0
    ? result.characterAssets.map((asset, index) => {
      const name = pickFirstLibTvAssetText(asset.name)
      const variant = pickFirstLibTvAssetText(asset.variantLabel)
      const title = name && variant && !normalizeLibTvCharacterKey(name).includes(normalizeLibTvCharacterKey(variant))
        ? `${name}_${variant}`
        : pickFirstLibTvAssetText(name, variant, asset.description, `角色 ${index + 1}`)
      return {
        id: buildLibTvScriptV2AssetId("角色", title || asset.description || "角色", index, asset.personaKey || asset.id || "asset"),
        kind: "角色" as const,
        title,
        imageUrl: pickFirstLibTvAssetText(asset.referenceImageUrl, ...(Array.isArray(asset.referenceImageUrls) ? asset.referenceImageUrls : [])),
        prompt: pickFirstLibTvAssetText(asset.identityPrompt, asset.description, asset.outfit, asset.accessories),
        modelId: String(asset.personaKey || asset.id || "derived").trim() || "derived",
        createdAt: Number.isFinite(Number(asset.generatedAt)) ? Number(asset.generatedAt) : Number.isFinite(Number(result.generatedAt)) ? Number(result.generatedAt) : Date.now(),
      }
    })
    : (Array.isArray(result.characterProfiles) ? result.characterProfiles : []).map((profile, index) => ({
      id: buildLibTvScriptV2AssetId("角色", profile.name || profile.description || "角色", index),
      kind: "角色" as const,
      title: pickFirstLibTvAssetText(profile.name, profile.aliases?.[0], profile.roleType, `角色 ${index + 1}`),
      imageUrl: "",
      prompt: pickFirstLibTvAssetText(profile.description, profile.appearance, profile.personality, profile.background),
      modelId: "derived",
      createdAt: Number.isFinite(Number(result.generatedAt)) ? Number(result.generatedAt) : Date.now(),
    }))
  return assets.length > 0 ? assets : collectLibTvScriptV2RowCharacterAssets(result)
}

function mapLibTvScriptV2SceneAssets(result: LibTvStoryboardScriptResult): LibTvScriptV2AssetItem[] {
  const sceneProfiles = Array.isArray(result.sceneProfiles) && result.sceneProfiles.length > 0
    ? result.sceneProfiles
    : deriveLibTvScriptV2SceneProfilesFromRows(result)
  return sceneProfiles.map((scene, index) => ({
    id: buildLibTvScriptV2AssetId("场景", scene.key || scene.description || "场景", index),
    kind: "场景" as const,
    title: pickFirstLibTvAssetText(scene.key, scene.location, scene.description, `场景 ${index + 1}`),
    imageUrl: "",
    prompt: pickFirstLibTvAssetText(scene.environmentPrompt, scene.description, scene.atmosphere, scene.props),
    modelId: "derived",
    createdAt: Number.isFinite(Number(result.generatedAt)) ? Number(result.generatedAt) : Date.now(),
  }))
}

const LIBTV_SCRIPT_V2_SCENE_NOISE_PATTERN = /(画面构图|构图|镜头|机位|视角|景别|远景|全景|中景|近景|特写|大特写|俯拍|仰拍|平视|侧拍|背拍|推镜|拉镜|摇镜|跟拍|跟镜|移镜|固定镜头|手持|焦距|景深|光影|灯光|氛围|微表情|人物空间|主体动作|角色动作|情绪|对白|音效|音乐|技术参数|视觉风格|无人物|无互动|时长|秒|f\/?\d+\.?\d*|mm镜头)/gi

function normalizeLibTvScriptV2SceneKey(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").replace(/[，,]+/g, "、").trim()
}

function normalizeLibTvScriptV2SceneCandidate(value: unknown) {
  return normalizeLibTvScriptV2SceneKey(value)
    .replace(LIBTV_SCRIPT_V2_SCENE_NOISE_PATTERN, " ")
    .replace(/[【】[\]（）()“”"']/g, " ")
    .replace(/[。；;，,、|｜:：]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenizeLibTvScriptV2Scene(value: unknown) {
  const text = normalizeLibTvScriptV2SceneCandidate(value)
  if (!text) return []
  const ascii = text.match(/[a-zA-Z0-9][a-zA-Z0-9_-]{1,}/g) || []
  const cjk = text.match(/[\u4e00-\u9fff]{2,8}/g) || []
  return Array.from(new Set([...ascii, ...cjk].map((item) => item.toLowerCase())))
}

function scoreLibTvScriptV2SceneSimilarity(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  setA.forEach((item) => {
    if (setB.has(item)) intersection += 1
  })
  return intersection / Math.max(setA.size, setB.size)
}

function inferLibTvScriptV2SceneKey(row: LibTvStoryboardScriptRow, byKey: Map<string, LibTvStoryboardSceneProfile>) {
  const explicit = normalizeLibTvScriptV2SceneCandidate(row.sceneAssetKey || row.sceneKey)
  if (explicit && explicit.length <= 28) return explicit

  const candidates = [
    row.sceneTags,
  ].map(normalizeLibTvScriptV2SceneCandidate).filter(Boolean)
  const candidateKey = candidates
    .map((text) => text.split(/\s+/).filter(Boolean).slice(0, 4).join(" "))
    .find((text) => text.length >= 2)
  const fallback = normalizeLibTvScriptV2SceneKey(cleanLibTvScriptValue(candidateKey || row.sceneTags || row.sceneKey || row.sceneAssetKey).slice(0, 18))
  if (!fallback) return ""
  const fallbackTokens = tokenizeLibTvScriptV2Scene(candidates.join(" "))
  let bestKey = ""
  let bestScore = 0
  byKey.forEach((profile, key) => {
    const score = scoreLibTvScriptV2SceneSimilarity(fallbackTokens, tokenizeLibTvScriptV2Scene(`${profile.key} ${profile.description}`))
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  })
  if (bestKey && bestScore >= 0.42) return bestKey
  return fallback
}

function deriveLibTvScriptV2SceneProfilesFromRows(result: LibTvStoryboardScriptResult): LibTvStoryboardSceneProfile[] {
  const rows = Array.isArray(result.rows) ? result.rows : []
  const byKey = new Map<string, LibTvStoryboardSceneProfile>()
  rows.forEach((row) => {
    const key = inferLibTvScriptV2SceneKey(row, byKey)
    if (!key) return
    const descriptionParts = [
      key,
      normalizeLibTvScriptV2SceneKey(row.sceneTags),
      cleanLibTvScriptValue(row.lightingAtmosphere).slice(0, 48),
    ].filter(Boolean)
    const current = byKey.get(key)
    const mergedDescription = Array.from(new Set([
      ...(current?.description ? current.description.split("；") : []),
      ...descriptionParts,
    ].map((item) => item.trim()).filter(Boolean))).slice(0, 4).join("；")
    byKey.set(key, {
      key,
      description: mergedDescription,
      location: current?.location || key,
      atmosphere: current?.atmosphere || cleanLibTvScriptValue(row.lightingAtmosphere || row.sceneTags).slice(0, 80),
      environmentPrompt: mergedDescription,
    })
  })
  return Array.from(byKey.values()).slice(0, 12)
}

function normalizeLibTvScriptV2PropKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
}

export function getLibTvScriptV2RowExplicitPropNames(row: LibTvStoryboardScriptRow | Record<string, unknown> | null | undefined) {
  const record = (row || {}) as Record<string, unknown>
  return [
    record.props,
    record.propNames,
    record.propKeys,
    record.usedProps,
    record.objects,
    record.objectNames,
  ].flatMap((value) => Array.isArray(value) ? value : String(value || "").split(/[、,，;；/|｜\n]+/g))
    .map((value) => String(value || "").trim())
    .filter(Boolean)
}

export function getLibTvScriptV2RowPropNames(row: LibTvStoryboardScriptRow | Record<string, unknown> | null | undefined) {
  return Array.from(new Set(getLibTvScriptV2RowExplicitPropNames(row)))
}

function collectLibTvScriptV2RowPropAssets(result: LibTvStoryboardScriptResult): LibTvScriptV2AssetItem[] {
  const rows = Array.isArray(result.rows) ? result.rows : []
  const byKey = new Map<string, LibTvScriptV2AssetItem>()
  const pushProp = (nameValue: unknown, promptValue?: unknown) => {
    const title = pickFirstLibTvAssetText(nameValue)
    if (!title) return
    const key = normalizeLibTvScriptV2PropKey(title)
    if (!key || byKey.has(key)) return
    const prompt = pickFirstLibTvAssetText(promptValue, title)
    byKey.set(key, {
      id: buildLibTvScriptV2AssetId("道具", title, byKey.size, key),
      kind: "道具",
      title,
      imageUrl: "",
      prompt,
      modelId: "row-derived",
      createdAt: Number.isFinite(Number(result.generatedAt)) ? Number(result.generatedAt) : Date.now(),
    })
  }

  rows.forEach((row) => {
    getLibTvScriptV2RowPropNames(row).forEach((name) => pushProp(name, name))
  })

  return Array.from(byKey.values()).slice(0, 12)
}

function mapLibTvScriptV2PropAssets(result: LibTvStoryboardScriptResult): LibTvScriptV2AssetItem[] {
  const explicitProps = (Array.isArray(result.propProfiles) ? result.propProfiles : []).map((prop, index) => ({
    id: buildLibTvScriptV2AssetId("道具", prop.name || prop.description || "道具", index),
    kind: "道具" as const,
    title: pickFirstLibTvAssetText(prop.name, prop.type, `道具 ${index + 1}`),
    imageUrl: "",
    prompt: pickFirstLibTvAssetText(prop.imagePrompt, prop.description),
    modelId: "derived",
    createdAt: Number.isFinite(Number(result.generatedAt)) ? Number(result.generatedAt) : Date.now(),
  }))
  return explicitProps.length > 0 ? explicitProps : collectLibTvScriptV2RowPropAssets(result)
}

export function deriveLibTvScriptV2AssetsByKind(result: LibTvStoryboardScriptResult | null | undefined): LibTvScriptV2AssetsByKind {
  const normalized = result || null
  return {
    "角色": normalized ? mapLibTvScriptV2CharacterAssets(normalized) : [],
    "场景": normalized ? mapLibTvScriptV2SceneAssets(normalized) : [],
    "道具": normalized ? mapLibTvScriptV2PropAssets(normalized) : [],
  }
}
