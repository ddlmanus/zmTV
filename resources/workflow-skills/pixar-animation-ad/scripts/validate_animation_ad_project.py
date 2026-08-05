#!/usr/bin/env python3
"""Validate staged continuity gates for a 3D cartoon animation ad project."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


APPROVED = {"approved", "passed", "complete", "completed"}
STAGES = ("assets", "storyboard", "video", "complete")
CHARACTER_ASSET_STAGES = (
    "character-identity-master",
    "character-face-turnaround",
    "character-body-turnaround",
    "character-expression-sheet",
)


def text(value: Any) -> str:
    return str(value or "").strip()


def objects(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def load_manifest(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("manifest root must be a JSON object")
    return data


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def first_text(item: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = text(item.get(key))
        if value:
            return value
    return ""


def asset_stage(asset: dict[str, Any]) -> str:
    return first_text(asset, "stage", "assetStage", "workflowAssetStage")


def asset_persona(asset: dict[str, Any]) -> str:
    return first_text(asset, "personaId", "characterId", "workflowAssetPersonaId")


def asset_id(asset: dict[str, Any]) -> str:
    return first_text(asset, "id", "assetId", "workflowScriptV2AssetId")


def asset_model(asset: dict[str, Any]) -> str:
    return first_text(asset, "modelId", "workflowScriptV2AssetModelId")


def asset_url(asset: dict[str, Any]) -> str:
    return first_text(asset, "url", "imageUrl", "mediaUrl")


def asset_task_id(asset: dict[str, Any]) -> str:
    return first_text(asset, "taskId", "generationTaskId")


def asset_source_node_id(asset: dict[str, Any]) -> str:
    return first_text(asset, "sourceNodeId", "nodeId")


def asset_review_status(asset: dict[str, Any]) -> str:
    return first_text(asset, "reviewStatus", "status").lower()


def all_assets(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    result = list(objects(manifest.get("assets")))
    for character in objects(manifest.get("characters")):
        persona_id = text(character.get("id"))
        for asset in objects(character.get("assets")):
            result.append({"personaId": persona_id, **asset})
    scene = manifest.get("scene")
    if isinstance(scene, dict):
        result.extend(objects(scene.get("assets")))
    product = manifest.get("product")
    if isinstance(product, dict):
        result.extend(objects(product.get("assets")))
    return result


def validate_asset_record(asset: dict[str, Any], label: str, errors: list[str]) -> None:
    require(bool(asset_id(asset)), f"{label}.id is required", errors)
    require(bool(asset_source_node_id(asset)), f"{label}.sourceNodeId is required", errors)
    require(bool(asset_url(asset)), f"{label}.imageUrl is required", errors)
    require(bool(asset_task_id(asset)), f"{label}.generationTaskId is required", errors)
    require(bool(asset_model(asset)), f"{label}.modelId is required", errors)
    require(asset_review_status(asset) in APPROVED, f"{label}.reviewStatus must be approved", errors)
    require(bool(first_text(asset, "reviewedAt")), f"{label}.reviewedAt is required", errors)


def validate_assets(manifest: dict[str, Any], errors: list[str]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    brief = manifest.get("brief") if isinstance(manifest.get("brief"), dict) else {}
    require(bool(text(brief.get("brandName"))), "brief.brandName is required", errors)
    require(bool(text(brief.get("product"))), "brief.product is required", errors)
    require(bool(text(brief.get("characterOccupation"))), "brief.characterOccupation is required", errors)
    require(bool(text(brief.get("performance"))), "brief.performance is required", errors)
    require(bool(text(brief.get("aspectRatio"))), "brief.aspectRatio is required", errors)
    try:
        duration = float(brief.get("durationSeconds"))
    except (TypeError, ValueError):
        duration = 0
    require(15 <= duration <= 90, "brief.durationSeconds must be between 15 and 90", errors)
    require(isinstance(manifest.get("brandFacts"), dict) and bool(manifest.get("brandFacts")),
            "brandFacts must be a non-empty object", errors)
    require(isinstance(manifest.get("style"), dict) and bool(manifest.get("style")),
            "style must be a non-empty object", errors)

    characters = objects(manifest.get("characters"))
    require(bool(characters), "characters must contain at least one character", errors)
    assets = all_assets(manifest)
    require(bool(assets), "assets must record generated character, scene, and product assets", errors)
    identity_models: dict[str, str] = {}
    for index, character in enumerate(characters):
        label = f"characters[{index}]"
        persona_id = text(character.get("id"))
        require(bool(persona_id), f"{label}.id is required", errors)
        require(bool(text(character.get("genderPresentation"))),
                f"{label}.genderPresentation is required", errors)
        require(bool(text(character.get("faceFingerprint")) or isinstance(character.get("faceFingerprint"), dict)),
                f"{label}.faceFingerprint is required", errors)
        require(bool(text(character.get("headBodyRatio")) or text(character.get("bodyProportions"))),
                f"{label}.headBodyRatio or bodyProportions is required", errors)
        require(bool(text(character.get("wardrobe")) or isinstance(character.get("wardrobe"), dict)),
                f"{label}.wardrobe is required", errors)
        require(bool(text(character.get("dominantHand"))), f"{label}.dominantHand is required", errors)
        require(bool(character.get("immutable")), f"{label}.immutable is required", errors)
        for required_stage in CHARACTER_ASSET_STAGES:
            matches = [asset for asset in assets
                       if asset_stage(asset) == required_stage and asset_persona(asset) == persona_id]
            require(bool(matches), f"{label} is missing {required_stage}", errors)
            for asset_index, asset in enumerate(matches):
                validate_asset_record(asset, f"{label}.{required_stage}[{asset_index}]", errors)
            if required_stage == "character-identity-master" and matches:
                require(len(matches) == 1,
                        f"{label} must have exactly one character-identity-master", errors)
                identity = matches[0]
                identity_models[persona_id] = asset_model(identity)
                require(identity.get("isContactSheet") is not True,
                        f"{label} identity master cannot be a contact sheet", errors)
            elif matches and identity_models.get(persona_id):
                for asset in matches:
                    require(asset_model(asset) == identity_models[persona_id],
                            f"{label}.{required_stage} must use the identity master model", errors)

    for required_stage in ("scene-master", "product-master", "product-turnaround"):
        matches = [asset for asset in assets if asset_stage(asset) == required_stage]
        require(bool(matches), f"assets is missing {required_stage}", errors)
        for index, asset in enumerate(matches):
            validate_asset_record(asset, f"assets.{required_stage}[{index}]", errors)
            if required_stage == "scene-master":
                require(asset.get("cleanPlate") is True,
                        f"assets.{required_stage}[{index}].cleanPlate must be true", errors)
                require(asset.get("containsCharacters") is False,
                        f"assets.{required_stage}[{index}].containsCharacters must be false", errors)

    return assets, identity_models


def validate_storyboard(manifest: dict[str, Any], identity_models: dict[str, str], errors: list[str]) -> float:
    shots = objects(manifest.get("shots"))
    require(bool(shots), "shots must contain at least one shot", errors)
    total = 0.0
    for index, shot in enumerate(shots):
        label = f"shots[{index}]"
        require(bool(text(shot.get("id"))), f"{label}.id is required", errors)
        try:
            total += float(shot.get("durationSeconds"))
        except (TypeError, ValueError):
            errors.append(f"{label}.durationSeconds must be numeric")
        require(bool(first_text(shot, "keyframeNodeId")), f"{label}.keyframeNodeId is required", errors)
        require(bool(first_text(shot, "keyframeUrl")), f"{label}.keyframeUrl is required", errors)
        require(bool(first_text(shot, "keyframeTaskId")), f"{label}.keyframeTaskId is required", errors)
        keyframe_model = first_text(shot, "keyframeModelId")
        require(bool(keyframe_model), f"{label}.keyframeModelId is required", errors)
        require(first_text(shot, "keyframeReviewStatus").lower() in APPROVED,
                f"{label}.keyframeReviewStatus must be approved", errors)
        require(bool(first_text(shot, "keyframeReviewedAt")), f"{label}.keyframeReviewedAt is required", errors)
        character_ids = [text(item) for item in shot.get("characterAssetIds", [])] \
            if isinstance(shot.get("characterAssetIds"), list) else []
        require(bool([item for item in character_ids if item]),
                f"{label}.characterAssetIds must reference the characters used by this shot", errors)
        require(bool(first_text(shot, "sceneAssetId")), f"{label}.sceneAssetId is required", errors)
        require(isinstance(shot.get("productAssetIds"), list) and bool(shot.get("productAssetIds")),
                f"{label}.productAssetIds is required", errors)
        for persona_id in character_ids:
            if persona_id in identity_models:
                require(keyframe_model == identity_models[persona_id],
                        f"{label}.keyframeModelId must match {persona_id} identity model", errors)
    brief = manifest.get("brief") if isinstance(manifest.get("brief"), dict) else {}
    try:
        duration = float(brief.get("durationSeconds"))
    except (TypeError, ValueError):
        duration = 0
    if duration:
        require(abs(total - duration) <= 0.25,
                f"shot durations total {total:.3f}s but brief duration is {duration:.3f}s", errors)
    return total


def validate_video(manifest: dict[str, Any], errors: list[str]) -> None:
    for index, shot in enumerate(objects(manifest.get("shots"))):
        label = f"shots[{index}]"
        require(bool(first_text(shot, "taskId", "videoTaskId")), f"{label}.videoTaskId is required", errors)
        require(bool(first_text(shot, "mediaUrl", "videoUrl")), f"{label}.videoUrl is required", errors)
        require(first_text(shot, "status", "videoReviewStatus").lower() in APPROVED,
                f"{label}.videoReviewStatus must be approved", errors)


def validate_complete(manifest: dict[str, Any], project_root: Path, errors: list[str]) -> None:
    lyrics = manifest.get("lyrics") if isinstance(manifest.get("lyrics"), dict) else {}
    require(bool(text(lyrics.get("text"))), "lyrics.text is required", errors)
    require(bool(text(lyrics.get("brandPronunciation"))), "lyrics.brandPronunciation is required", errors)
    audio = objects(manifest.get("audio"))
    require(bool(audio), "audio must contain jingle, dialogue, music, or sound assets", errors)
    for index, item in enumerate(audio):
        require(bool(first_text(item, "taskId")), f"audio[{index}].taskId is required", errors)
        require(first_text(item, "status", "reviewStatus").lower() in APPROVED,
                f"audio[{index}].reviewStatus must be approved", errors)
    logo_end = manifest.get("logoEndFrame") if isinstance(manifest.get("logoEndFrame"), dict) else {}
    require(bool(text(logo_end.get("logoSource"))), "logoEndFrame.logoSource is required", errors)
    require(bool(text(logo_end.get("cta"))), "logoEndFrame.cta is required", errors)
    acceptance = manifest.get("acceptance") if isinstance(manifest.get("acceptance"), dict) else {}
    for layer in ("brandFacts", "originality", "character", "product", "storyAndLyrics", "audiovisual", "technical"):
        require(text(acceptance.get(layer)).lower() in {"pass", "passed"},
                f"acceptance.{layer} must be PASS", errors)
    deliverables = [item for item in objects(manifest.get("deliverables"))
                    if text(item.get("type")).lower() == "mp4"]
    require(bool(deliverables), "deliverables must contain an MP4", errors)
    for index, item in enumerate(deliverables):
        raw_path = text(item.get("path"))
        require(bool(raw_path), f"MP4 deliverable[{index}].path is required", errors)
        if raw_path:
            output_path = Path(raw_path)
            if not output_path.is_absolute():
                output_path = project_root / output_path
            require(output_path.is_file() and output_path.stat().st_size > 0,
                    f"MP4 deliverable does not exist or is empty: {output_path}", errors)


def validate(manifest: dict[str, Any], project_root: Path, stage: str) -> list[str]:
    errors: list[str] = []
    _, identity_models = validate_assets(manifest, errors)
    if STAGES.index(stage) >= STAGES.index("storyboard"):
        validate_storyboard(manifest, identity_models, errors)
    if STAGES.index(stage) >= STAGES.index("video"):
        validate_video(manifest, errors)
    if stage == "complete":
        validate_complete(manifest, project_root, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path, help="Animation ad project directory")
    parser.add_argument("--stage", choices=STAGES, default="assets",
                        help="Highest production gate that must be complete")
    parser.add_argument("--claim-complete", action="store_true",
                        help="Backward-compatible alias for --stage complete")
    args = parser.parse_args()
    stage = "complete" if args.claim_complete else args.stage

    root = args.project.expanduser().resolve()
    manifest_path = root / "production" / "animation-ad-manifest.json"
    if not manifest_path.is_file():
        print(f"ERROR: missing manifest: {manifest_path}", file=sys.stderr)
        return 2
    try:
        errors = validate(load_manifest(manifest_path), root, stage)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1
    print(f"PASS: animation ad project {stage} validation succeeded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
