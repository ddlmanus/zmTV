import {
  buildLibTvCharacterSceneExtractorPrompt,
  buildLibTvCharacterSceneExtractorSystemPrompt,
  buildLibTvContinuityGuardPrompt,
  buildLibTvContinuityGuardSystemPrompt,
  buildLibTvPacingEditorPrompt,
  buildLibTvPacingEditorSystemPrompt,
  buildLibTvScreenplayRewritePrompt,
  buildLibTvScreenplayRewriterSystemPrompt,
  buildLibTvScriptUserPrompt,
  buildLibTvStyleBibleGuardPrompt,
  buildLibTvStyleBibleGuardSystemPrompt,
  buildLibTvStoryboardBreakerSystemPrompt,
  buildLibTvStoryboardSupervisorPrompt,
  buildLibTvStoryboardSupervisorSystemPrompt,
} from "../../../src/workflow/ideart/lib/libtv/script-prompts";
import type { LibTvStoryboardScriptRow } from "../../../src/workflow/ideart/lib/libtv/script";

type JsonRecord = Record<string, any>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, max = 20_000) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function jsonObject(value: string) {
  const normalized = String(value || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return record(JSON.parse(normalized.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function workflowInput(body: JsonRecord) {
  const workflow = record(body.workflow);
  const nodes = list(workflow.nodes)
    .map(record)
    .filter((node) => text(node.id));
  const edges = list(workflow.edges).map(record);
  const targetId = text(body.targetNodeId);
  const target =
    nodes.find((node) => text(node.id) === targetId) ||
    nodes.find((node) => /script/.test(text(node.kind))) ||
    {};
  const targetData = record(target.data);
  const reverse = new Map<string, string[]>();
  edges.forEach((edge) => {
    const source = text(edge.source);
    const targetNode = text(edge.target);
    if (!source || !targetNode) return;
    reverse.set(targetNode, [...(reverse.get(targetNode) || []), source]);
  });
  const upstreamIds: string[] = [];
  const queue = [targetId || text(target.id)];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() || "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    (reverse.get(id) || []).forEach((parentId) => queue.push(parentId));
    if (id !== text(target.id)) upstreamIds.push(id);
  }
  const upstream = upstreamIds
    .map((id) => nodes.find((node) => text(node.id) === id))
    .filter(Boolean) as JsonRecord[];
  const sourceNodes =
    upstream.length > 0
      ? upstream
      : nodes.filter((node) => text(node.id) !== text(target.id));
  const sourceScript =
    sourceNodes
      .filter(
        (node) =>
          text(node.kind) === "text" || text(node.data?.kind) === "text",
      )
      .map((node) => {
        const data = record(node.data);
        return [
          text(data.title || node.title, 200),
          text(
            data.richTextContent || data.content || data.prompt || node.prompt,
            20_000,
          ),
        ]
          .filter(Boolean)
          .join("\n");
      })
      .filter(Boolean)
      .join("\n\n") || text(targetData.prompt || body.prompt, 20_000);
  const referenceNotes = sourceNodes
    .filter((node) => ["image", "video", "audio"].includes(text(node.kind)))
    .map((node) => {
      const data = record(node.data);
      return [
        text(data.title || node.title || "参考节点", 200),
        text(data.prompt || node.prompt, 4_000),
        text(data.mediaUrl || node.mediaUrl || node.src, 20_000),
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .filter(Boolean);
  const existingResult = record(targetData.scriptResult);
  const selectedOptionId =
    text(targetData.selectedOptionId || body.selectedOptionId) ||
    "storyboard-script";
  const capability =
    selectedOptionId === "video-storyboard-script"
      ? {
          intent: "根据参考视频生成脚本",
          analysisFocus:
            "优先还原参考视频的主体、构图、景别切换、镜头衔接与节奏。",
          optionGuide: "重点吸收视频参考带来的镜头节奏、景别切换和运动提示词。",
        }
      : selectedOptionId === "character-storyboard-script"
        ? {
            intent: "人物生成分镜信息",
            analysisFocus: "强化人物识别锚点、人物动作与跨镜头一致性约束。",
            optionGuide: "重点强化人物形象一致性、人物描述和人物动作设计。",
          }
        : {
            intent: "根据故事生成脚本",
            analysisFocus: "以故事事件顺序为主轴，生成忠于原文的镜头脚本。",
            optionGuide:
              "标准镜头拆解，重点补全画面描述、画面提示词和视频运动提示词。",
          };

  return {
    title:
      text(targetData.title || targetData.name || target.title, 200) ||
      "脚本生成器",
    userPrompt: text(targetData.prompt || body.prompt, 20_000),
    sourceScript,
    referenceNotes,
    selectedOptionId,
    capability,
    existingResult,
  };
}

export function buildCodexStoryboardPrompt(body: JsonRecord) {
  const input = workflowInput(body);
  const formattedScreenplay = text(
    input.existingResult.formattedScreenplay || input.sourceScript,
    30_000,
  );
  const existingScenes = list(input.existingResult.sceneProfiles).map(record);
  const existingCharacterRules =
    text(input.existingResult.characterConsistencyRules, 12_000) || "无";
  const systemPrompts = [
    buildLibTvScreenplayRewriterSystemPrompt(),
    buildLibTvCharacterSceneExtractorSystemPrompt(),
    buildLibTvStoryboardBreakerSystemPrompt(),
    buildLibTvStoryboardSupervisorSystemPrompt(),
    buildLibTvContinuityGuardSystemPrompt(),
    buildLibTvStyleBibleGuardSystemPrompt(),
    buildLibTvPacingEditorSystemPrompt(),
  ].join("\n\n--- 内部质量标准 ---\n\n");
  const screenplayPrompt = buildLibTvScreenplayRewritePrompt({
    title: input.title,
    sourceScript: input.sourceScript,
    userPrompt: input.userPrompt,
    referenceNotes: input.referenceNotes,
  });
  const extractionPrompt = buildLibTvCharacterSceneExtractorPrompt({
    title: input.title,
    formattedScreenplay,
    formattedScreenplayScenes: Array.isArray(
      input.existingResult.formattedScreenplayScenes,
    )
      ? input.existingResult.formattedScreenplayScenes
      : [],
    sourceScript: input.sourceScript,
    userPrompt: input.userPrompt,
    referenceNotes: input.referenceNotes,
    mentionHint: "无",
  });
  const scriptPrompt = buildLibTvScriptUserPrompt({
    capabilityIntent: input.capability.intent,
    capabilityAnalysisFocus: input.capability.analysisFocus,
    optionGuide: input.capability.optionGuide,
    characterConsistencyRules: existingCharacterRules,
    sceneProfiles: existingScenes.map((scene) => ({
      key: text(scene.key),
      description: text(scene.description),
    })),
    title: input.title,
    userPrompt: input.userPrompt,
    sourceScript: input.sourceScript,
    formattedScreenplay,
    referenceNotes: input.referenceNotes,
  });
  const selfReviewPrompts = [
    buildLibTvStoryboardSupervisorPrompt({
      title: input.title,
      sourceScript: input.sourceScript,
      formattedScreenplay,
      rowsJson: "请在生成结果后对最终 shots/rows 自审，不要把此占位文本输出。",
      characterConsistencyRules: existingCharacterRules,
      sceneProfilesText:
        existingScenes
          .map((scene) => text(scene.description))
          .filter(Boolean)
          .join("\n") || "无",
    }),
    buildLibTvContinuityGuardPrompt({
      title: input.title,
      sourceScript: input.sourceScript,
      formattedScreenplay,
      rowsJson: "请在生成结果后对最终 shots/rows 自审，不要把此占位文本输出。",
      characterConsistencyRules: existingCharacterRules,
      sceneProfilesText:
        existingScenes
          .map((scene) => text(scene.description))
          .filter(Boolean)
          .join("\n") || "无",
    }),
    buildLibTvStyleBibleGuardPrompt({
      title: input.title,
      sourceScript: input.sourceScript,
      formattedScreenplay,
      rowsJson: "请在生成结果后对最终 shots/rows 自审，不要把此占位文本输出。",
      characterConsistencyRules: existingCharacterRules,
      sceneProfilesText:
        existingScenes
          .map((scene) => text(scene.description))
          .filter(Boolean)
          .join("\n") || "无",
    }),
    buildLibTvPacingEditorPrompt({
      title: input.title,
      sourceScript: input.sourceScript,
      formattedScreenplay,
      rowsJson: "请在生成结果后对最终 shots/rows 自审，不要把此占位文本输出。",
      characterConsistencyRules: existingCharacterRules,
      sceneProfilesText:
        existingScenes
          .map((scene) => text(scene.description))
          .filter(Boolean)
          .join("\n") || "无",
    }),
  ].join("\n\n");

  return [
    "你正在桌面端造梦工作流中执行一次分镜任务。你是唯一的分镜 Codex Agent，不要调用或模拟多 Agent，不要联网调用 Ideart 线上接口，不要修改项目文件。",
    "请在一次任务中完成：格式化剧本、提取角色/场景/道具、拆解专业分镜、执行连续性/视觉风格/节奏/审片自检。内部可以按步骤思考，但最终只输出一个合法 JSON 对象，不要 Markdown、不要解释、不要输出思考过程。",
    "以下是从 Ideart 完整迁移的系统提示词与质量标准，必须逐条遵守：\n\n" +
      systemPrompts,
    "以下是从 Ideart 完整迁移的剧本改写提示词：\n\n" + screenplayPrompt,
    "以下是从 Ideart 完整迁移的角色、场景、道具提取提示词：\n\n" +
      extractionPrompt,
    "以下是从 Ideart 完整迁移的分镜生产包提示词：\n\n" + scriptPrompt,
    "以下是从 Ideart 完整迁移的四项质量审阅提示词。生成最终结果前，按其中的 approved/score/issues/rewriteBrief 规则在内部自审并修正；不要把审阅对象占位文本或审阅过程写进最终 JSON：\n\n" +
      selfReviewPrompts,
    input.existingResult.rows?.length
      ? "已有工作流分镜草稿（prepare-assets 或修订场景时必须保留并完善，不得另起炉灶）：\n" +
        JSON.stringify(input.existingResult)
      : "",
    "最终 JSON 必须至少包含 title、summary、sourceScript、userPrompt、selectedOptionId、characterProfiles、sceneProfiles、propProfiles、rows、generatedAt。rows 使用当前桌面端 LibTvStoryboardScriptResult 的字段命名；每行必须有 storyboardPrompt 和 motionPrompt。可以同时保留 assets/shots 结构，但兼容字段 rows 必须真实完整，不能只返回占位示例。",
    "当前任务输入：\n" +
      JSON.stringify({
        title: input.title,
        selectedOptionId: input.selectedOptionId,
        userPrompt: input.userPrompt,
        sourceScript: input.sourceScript,
        referenceNotes: input.referenceNotes,
      }),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeShot(
  shot: JsonRecord,
  index: number,
): LibTvStoryboardScriptRow {
  const entities = list(shot.plot_description_entity_refs).map(record);
  const characters = list(shot.characters).map(record);
  const firstCharacter = text(
    characters[0]?.characterName || entities[0]?.text,
  );
  const secondCharacter = text(
    characters[1]?.characterName || entities[1]?.text,
  );
  return {
    shotNumber: text(shot.shot_number || shot.shotNumber) || String(index + 1),
    startTime: text(shot.start_time || shot.startTime),
    endTime: text(shot.end_time || shot.endTime),
    duration: text(shot.duration_seconds || shot.duration) || "5",
    visualDescription: text(shot.plot_description || shot.visualDescription),
    narrativeContent: text(shot.narrativeContent || shot.plot_description),
    character1: firstCharacter,
    characterDescription1: text(characters[0]?.characterDescription),
    characterImage1: text(characters[0]?.characterImageUrl),
    character2: secondCharacter,
    characterDescription2: text(characters[1]?.characterDescription),
    characterImage2: text(characters[1]?.characterImageUrl),
    referenceImage: text(shot.reference_image || shot.referenceImage),
    shotType: text(shot.shot_size || shot.shotType),
    cameraAngle: text(shot.camera_angle || shot.cameraAngle),
    cameraMovement: text(
      shot.cinematics?.camera_movement || shot.cameraMovement,
    ),
    focalDepth: text(shot.focal_depth || shot.focalDepth),
    characterAction: text(shot.characterAction || shot.emotion),
    emotion: text(shot.emotion),
    sceneTags: text(
      shot.scene_key || shot.sceneTags || shot.scene_asset_ids?.[0],
    ),
    sceneKey: text(
      shot.scene_key || shot.sceneKey || shot.scene_asset_ids?.[0],
    ),
    sceneAssetKey: text(
      shot.scene_key || shot.sceneAssetKey || shot.scene_asset_ids?.[0],
    ),
    lightingAtmosphere: text(
      shot.lighting_and_atmosphere || shot.lightingAtmosphere,
    ),
    musicRhythm: text(shot.musicRhythm),
    voice: text(shot.voice),
    soundEffect: text(shot.audio_effects || shot.soundEffect),
    dialogue: text(shot.dialogue || shot.dialogue_lines?.[0]?.text),
    subtitleText: text(shot.subtitle_text || shot.subtitleText),
    subtitleStartTime: text(shot.subtitle_start_time || shot.subtitleStartTime),
    subtitleEndTime: text(shot.subtitle_end_time || shot.subtitleEndTime),
    storyboardPrompt: text(
      shot.final_image_prompt ||
        shot.image_generation_prompt ||
        shot.storyboardPrompt,
    ),
    motionPrompt: text(shot.video_motion_prompt || shot.motionPrompt),
  };
}

export function normalizeCodexStoryboardResult(
  output: string,
  defaults: {
    title: string;
    sourceScript: string;
    userPrompt: string;
    selectedOptionId: string;
  },
) {
  const parsed = jsonObject(output);
  if (!parsed) return null;
  const rows =
    list(parsed.rows).map(record).length > 0
      ? list(parsed.rows).map(record)
      : list(parsed.shots)
          .map(record)
          .map((shot, index) => normalizeShot(shot, index));
  if (rows.length === 0) return null;
  const assets = record(parsed.assets);
  const characterProfiles =
    list(parsed.characterProfiles).length > 0
      ? list(parsed.characterProfiles).map(record)
      : list(assets.characters)
          .map(record)
          .map((item) => ({
            name: text(item.name),
            description: text(item.desc || item.description),
            aliases: list(item.aliases)
              .map((alias) => text(alias))
              .filter(Boolean),
          }));
  const sceneProfiles =
    list(parsed.sceneProfiles).length > 0
      ? list(parsed.sceneProfiles).map(record)
      : list(assets.scenes)
          .map(record)
          .map((item) => ({
            key: text(item.name || item.id),
            description: text(item.desc || item.description),
            environmentPrompt: text(item.environmentPrompt),
          }));
  const propProfiles =
    list(parsed.propProfiles).length > 0
      ? list(parsed.propProfiles).map(record)
      : list(assets.props)
          .map(record)
          .map((item) => ({
            name: text(item.name),
            type: text(item.type),
            description: text(item.desc || item.description),
            imagePrompt: text(item.imagePrompt),
          }));
  return {
    ...parsed,
    title: text(parsed.title || parsed.meta?.title) || defaults.title,
    summary: text(parsed.summary || parsed.meta?.summary || parsed.meta?.theme),
    sourceScript: text(parsed.sourceScript) || defaults.sourceScript,
    userPrompt: text(parsed.userPrompt) || defaults.userPrompt,
    selectedOptionId:
      text(parsed.selectedOptionId) || defaults.selectedOptionId,
    characterProfiles,
    sceneProfiles,
    propProfiles,
    rows,
    generatedAt: Date.now(),
  };
}
