import type {
  LibTvStoryboardCharacterAsset,
  LibTvStoryboardScriptResult,
  LibTvStoryboardScriptRow,
} from "./script";
import {
  buildLibTvContinuityPackage,
  deriveLibTvSceneProfiles,
} from "./storyboard-guidelines";
import { buildLibTvLocalStoryboardPrompt } from "./storyboard-prompts";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizedName(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, "");
}

function summarizeReferenceImage(value: unknown) {
  const url = clean(value);
  if (!url) return "";
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
    return "已附参考图（内联图片）";
  }
  return url.length > 240 ? "已附参考图（长链接已省略）" : url;
}

function rowCharacterNames(row: LibTvStoryboardScriptRow) {
  return [row.character1, row.character2]
    .flatMap((value) => clean(value).split(/[、,，/|；;]/))
    .map(normalizedName)
    .filter(Boolean);
}

function rowCharacterAssets(
  row: LibTvStoryboardScriptRow,
  assets: LibTvStoryboardCharacterAsset[],
) {
  const ids = new Set(
    [
      row.characterAssetId1,
      row.characterAssetId2,
      row.characterPersonaKey1,
      row.characterPersonaKey2,
    ]
      .map(clean)
      .filter(Boolean),
  );
  const names = new Set(rowCharacterNames(row));
  return assets.filter((asset) => {
    return (
      ids.has(clean(asset.id)) ||
      ids.has(clean(asset.personaKey)) ||
      names.has(normalizedName(asset.name)) ||
      names.has(normalizedName(asset.characterKey))
    );
  });
}

function formatCharacterBaseAssets(
  row: LibTvStoryboardScriptRow,
  assets: LibTvStoryboardCharacterAsset[],
) {
  const relevantAssets = rowCharacterAssets(row, assets);
  if (relevantAssets.length === 0) return "无";

  return relevantAssets
    .map((asset) =>
      [
        `- 角色资产ID/personaKey：${asset.personaKey}`,
        `角色名：${asset.name}`,
        asset.identityPrompt ? `基座身份锚点：${asset.identityPrompt}` : "",
        asset.facialFeatures ? `稳定五官/脸型：${asset.facialFeatures}` : "",
        asset.skinTone ? `肤色：${asset.skinTone}` : "",
        asset.hairStyle ? `稳定发型：${asset.hairStyle}` : "",
        asset.bodyType ? `稳定体态：${asset.bodyType}` : "",
        asset.outfit ? `默认服装：${asset.outfit}` : "",
        asset.accessories ? `固定配饰：${asset.accessories}` : "",
        summarizeReferenceImage(asset.referenceImageUrl)
          ? `canonical参考图：${summarizeReferenceImage(asset.referenceImageUrl)}`
          : "",
      ]
        .filter(Boolean)
        .join("；"),
    )
    .join("\n");
}

function formatShotState(row: LibTvStoryboardScriptRow) {
  const states = [
    row.character1
      ? [
          `角色：${row.character1}`,
          row.characterAssetId1
            ? `绑定角色资产记录ID：${row.characterAssetId1}`
            : "",
          row.characterPersonaKey1
            ? `绑定角色资产ID：${row.characterPersonaKey1}`
            : "",
          row.wardrobeOverride1
            ? `本镜头服装变化：${row.wardrobeOverride1}`
            : "本镜头服装变化：无，必须继承角色基座默认服装",
          row.characterAction ? `动作：${row.characterAction}` : "",
          row.emotion ? `情绪：${row.emotion}` : "",
        ]
          .filter(Boolean)
          .join("；")
      : "",
    row.character2
      ? [
          `角色：${row.character2}`,
          row.characterAssetId2
            ? `绑定角色资产记录ID：${row.characterAssetId2}`
            : "",
          row.characterPersonaKey2
            ? `绑定角色资产ID：${row.characterPersonaKey2}`
            : "",
          row.wardrobeOverride2
            ? `本镜头服装变化：${row.wardrobeOverride2}`
            : "本镜头服装变化：无，必须继承角色基座默认服装",
        ]
          .filter(Boolean)
          .join("；")
      : "",
    row.sceneAssetKey || row.sceneKey
      ? `绑定场景资产Key：${row.sceneAssetKey || row.sceneKey}`
      : "",
    row.shotType ? `机位/景别：${row.shotType}` : "",
    row.lightingAtmosphere ? `本镜头光线：${row.lightingAtmosphere}` : "",
  ].filter(Boolean);

  return states.length > 0 ? states.join("\n") : "无";
}

export function buildWorkflowStoryboardImagePrompt(params: {
  result: LibTvStoryboardScriptResult;
  rowIndex: number;
  cameraControl?: {
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
  };
}) {
  const row = params.result.rows[params.rowIndex];
  if (!row) return "";
  const characterProfiles = Array.isArray(params.result.characterProfiles)
    ? params.result.characterProfiles
    : [];
  const sceneProfiles =
    Array.isArray(params.result.sceneProfiles) &&
    params.result.sceneProfiles.length > 0
      ? params.result.sceneProfiles
      : deriveLibTvSceneProfiles(params.result.rows);
  const characterAssets = Array.isArray(params.result.characterAssets)
    ? params.result.characterAssets
    : [];
  const cameraControlHint = [
    params.cameraControl?.camera
      ? `camera: ${params.cameraControl.camera}`
      : "",
    params.cameraControl?.lens ? `lens: ${params.cameraControl.lens}` : "",
    params.cameraControl?.focalLength
      ? `focal length: ${params.cameraControl.focalLength}`
      : "",
    params.cameraControl?.aperture
      ? `aperture: ${params.cameraControl.aperture}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return buildLibTvLocalStoryboardPrompt({
    title: clean(params.result.title) || "未命名分镜",
    result: params.result,
    rowIndex: params.rowIndex,
    characterProfiles,
    characterBaseAssetsText: formatCharacterBaseAssets(row, characterAssets),
    shotStateText: formatShotState(row),
    sceneProfiles,
    continuityPackage: buildLibTvContinuityPackage(
      params.result,
      sceneProfiles,
    ),
    cameraControlHint: cameraControlHint || undefined,
  });
}
