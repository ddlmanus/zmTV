#!/usr/bin/env python3
"""Validate a viral-commerce-short-drama project and its completion claim."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


PASS_STATES = {"approved", "complete", "completed", "pass", "passed"}
FINAL_TYPES = {"final_mp4", "final-mp4", "master_mp4", "master-mp4"}


def state(value: Any) -> str:
    return str(value or "").strip().lower()


def item_path(item: dict[str, Any]) -> str:
    return str(item.get("path") or item.get("file") or item.get("output") or "").strip()


def resolve_file(root: Path, value: str) -> Path:
    candidate = Path(value)
    return candidate if candidate.is_absolute() else root / candidate


def check_file(root: Path, value: str, label: str, errors: list[str]) -> Path | None:
    if not value:
        errors.append(f"{label}: missing path")
        return None
    path = resolve_file(root, value)
    if not path.is_file():
        errors.append(f"{label}: file does not exist: {path}")
        return None
    if path.stat().st_size <= 0:
        errors.append(f"{label}: file is empty: {path}")
        return None
    return path


def probe_video(path: Path, errors: list[str], warnings: list[str]) -> None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        warnings.append("ffprobe is unavailable; decode and stream checks were skipped")
        return
    probe = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate",
            "-of", "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if probe.returncode != 0:
        errors.append(f"video is not decodable: {probe.stderr.strip() or path}")
        return
    try:
        data = json.loads(probe.stdout)
    except json.JSONDecodeError:
        errors.append(f"ffprobe returned invalid JSON for {path}")
        return
    streams = data.get("streams") or []
    if not any(stream.get("codec_type") == "video" for stream in streams):
        errors.append(f"video has no decodable video stream: {path}")


def unique_ids(items: list[Any], label: str, errors: list[str]) -> set[str]:
    ids: set[str] = set()
    singular = label[:-1]
    for index, raw in enumerate(items):
        if not isinstance(raw, dict):
            errors.append(f"{label}[{index}] must be an object")
            continue
        item_id = str(raw.get("id") or raw.get(f"{singular}Id") or "").strip()
        if not item_id:
            errors.append(f"{label}[{index}] is missing an id")
        elif item_id in ids:
            errors.append(f"{label}: duplicate id {item_id}")
        else:
            ids.add(item_id)
    return ids


def numeric(value: Any, label: str, errors: list[str]) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        errors.append(f"{label} must be numeric")
        return None
    if result < 0:
        errors.append(f"{label} must not be negative")
        return None
    return result


def validate_timeline(
    shots: list[Any],
    total_duration: float | None,
    errors: list[str],
    warnings: list[str],
) -> None:
    timed: list[tuple[float, float, str]] = []
    for index, raw in enumerate(shots):
        if not isinstance(raw, dict):
            continue
        shot_id = str(raw.get("id") or raw.get("shotId") or index)
        start = numeric(raw.get("startSeconds"), f"shot {shot_id}.startSeconds", errors)
        end = numeric(raw.get("endSeconds"), f"shot {shot_id}.endSeconds", errors)
        if start is None or end is None:
            continue
        if end <= start:
            errors.append(f"shot {shot_id}: endSeconds must be greater than startSeconds")
            continue
        timed.append((start, end, shot_id))

    timed.sort()
    for previous, current in zip(timed, timed[1:]):
        if current[0] < previous[1] - 0.02:
            errors.append(f"timeline overlap: {previous[2]} and {current[2]}")
        elif current[0] > previous[1] + 0.08:
            warnings.append(f"timeline gap between {previous[2]} and {current[2]}")
    if timed and timed[0][0] > 0.08:
        warnings.append("timeline does not start at 0 seconds")
    if timed and total_duration is not None and abs(timed[-1][1] - total_duration) > 0.15:
        errors.append("last shot endSeconds does not match project durationSeconds")


def validate_manifest(root: Path, manifest: dict[str, Any], mode: str) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    project = manifest.get("project")
    total_duration: float | None = None
    if not isinstance(project, dict):
        errors.append("project must be an object")
    else:
        for key in ("name", "platform", "language"):
            if not str(project.get(key) or "").strip():
                errors.append(f"project.{key} is required")
        total_duration = numeric(project.get("durationSeconds"), "project.durationSeconds", errors)
        if not str(project.get("aspectRatio") or "").strip():
            errors.append("project.aspectRatio is required")

    product_facts = manifest.get("productFacts")
    if not isinstance(product_facts, list) or not product_facts:
        errors.append("productFacts must contain at least one verified fact")
        product_facts = []
    fact_ids = unique_ids(product_facts, "facts", errors)
    for fact in product_facts:
        if not isinstance(fact, dict):
            continue
        if not str(fact.get("evidence") or fact.get("evidencePath") or "").strip():
            errors.append(f"fact {fact.get('id')}: missing evidence")
        if not str(fact.get("allowedWording") or fact.get("claim") or "").strip():
            errors.append(f"fact {fact.get('id')}: missing allowed wording")

    audience = manifest.get("audience")
    if not isinstance(audience, dict):
        errors.append("audience must be an object")
    else:
        for key in ("segment", "painPoint", "primaryObjection", "desiredAction"):
            if not str(audience.get(key) or "").strip():
                errors.append(f"audience.{key} is required")

    concept = manifest.get("concept")
    if not isinstance(concept, dict):
        errors.append("concept must be an object")
    else:
        for key in ("hook", "conflict", "productCausalRole", "payoff", "cta"):
            if not str(concept.get(key) or "").strip():
                errors.append(f"concept.{key} is required")
        if state(concept.get("complianceStatus")) not in PASS_STATES:
            errors.append("concept.complianceStatus must be passed")

    assets = manifest.get("assets")
    shots = manifest.get("shots")
    deliverables = manifest.get("deliverables")
    for label, value in (("assets", assets), ("shots", shots), ("deliverables", deliverables)):
        if not isinstance(value, list):
            errors.append(f"{label} must be an array")
    assets = assets if isinstance(assets, list) else []
    shots = shots if isinstance(shots, list) else []
    deliverables = deliverables if isinstance(deliverables, list) else []

    asset_ids = unique_ids(assets, "assets", errors)
    unique_ids(shots, "shots", errors)
    unique_ids(deliverables, "deliverables", errors)
    validate_timeline(shots, total_duration, errors, warnings)

    hook_shots = []
    evidence_shots = []
    cta_shots = []
    for index, raw in enumerate(shots):
        if not isinstance(raw, dict):
            continue
        shot_id = str(raw.get("id") or raw.get("shotId") or index)
        for asset_id in raw.get("assetIds") or []:
            if str(asset_id) not in asset_ids:
                errors.append(f"shot {shot_id}: unknown assetId {asset_id}")
        for fact_id in raw.get("factIds") or []:
            if str(fact_id) not in fact_ids:
                errors.append(f"shot {shot_id}: unknown factId {fact_id}")
        job = state(raw.get("storyJob"))
        if "hook" in job or "钩子" in str(raw.get("storyJob") or ""):
            hook_shots.append(raw)
        if raw.get("factIds") or "evidence" in job or "证据" in str(raw.get("storyJob") or ""):
            evidence_shots.append(raw)
        if "cta" in job or "cta" in str(raw.get("storyJob") or "").lower():
            cta_shots.append(raw)

        keyframes = raw.get("keyframes")
        if mode in {"ready-to-render", "complete"}:
            if not isinstance(keyframes, list) or not keyframes:
                errors.append(f"shot {shot_id}: missing keyframes")
            elif len(keyframes) < 2 and not str(raw.get("staticReason") or "").strip():
                errors.append(f"shot {shot_id}: fewer than two keyframes without staticReason")

    if shots and not hook_shots:
        errors.append("shots: missing a hook shot")
    for raw in hook_shots:
        start = raw.get("startSeconds")
        if start is not None:
            try:
                if float(start) > 1.5:
                    errors.append(f"hook shot {raw.get('id')}: starts after 1.5 seconds")
            except (TypeError, ValueError):
                pass
    if shots and not evidence_shots:
        errors.append("shots: missing a product evidence beat")
    if shots and not cta_shots:
        errors.append("shots: missing a CTA beat")

    if mode in {"ready-to-render", "complete"}:
        if not shots:
            errors.append("no shots are defined")
        for asset in assets:
            if isinstance(asset, dict) and asset.get("required", True):
                if state(asset.get("status")) not in PASS_STATES:
                    errors.append(f"asset {asset.get('id')}: required asset is not approved")
        for shot in shots:
            if not isinstance(shot, dict):
                continue
            shot_id = shot.get("id") or shot.get("shotId")
            video = shot.get("video")
            if not isinstance(video, dict):
                errors.append(f"shot {shot_id}: missing video record")
                continue
            if state(video.get("status")) not in PASS_STATES:
                errors.append(f"shot {shot_id}: video is not approved")
            check_file(root, item_path(video), f"shot {shot_id} video", errors)

    if mode == "complete":
        final_candidates = [
            item for item in deliverables
            if isinstance(item, dict)
            and str(item.get("type") or item.get("id") or "").strip().lower() in FINAL_TYPES
        ]
        if not final_candidates:
            errors.append("deliverables: missing final_mp4")
        for item in final_candidates:
            if state(item.get("status")) not in PASS_STATES:
                errors.append("final_mp4 is not approved")
            path = check_file(root, item_path(item), "final_mp4", errors)
            if path:
                probe_video(path, errors, warnings)

        acceptance = manifest.get("acceptance")
        gates = {"facts", "story", "retention", "product", "continuity", "audio_text", "technical"}
        if not isinstance(acceptance, dict):
            errors.append("acceptance must contain seven final gates")
        else:
            missing = sorted(gates - set(acceptance))
            if missing:
                errors.append("acceptance is missing gates: " + ", ".join(missing))
            for gate in sorted(gates & set(acceptance)):
                if state(acceptance.get(gate)) not in PASS_STATES:
                    errors.append(f"acceptance.{gate} is not passed")

    return {"errors": errors, "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", help="Commerce-drama project directory")
    parser.add_argument(
        "--mode",
        choices=("structure", "ready-to-render", "complete"),
        default="structure",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    manifest_path = root / "production" / "commerce-drama-manifest.json"
    if not manifest_path.is_file():
        result = {"errors": [f"manifest does not exist: {manifest_path}"], "warnings": []}
    else:
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            result = {"errors": [f"cannot read manifest: {exc}"], "warnings": []}
        else:
            result = validate_manifest(root, payload, args.mode) if isinstance(payload, dict) else {
                "errors": ["manifest root must be an object"],
                "warnings": [],
            }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for warning in result["warnings"]:
            print(f"WARN: {warning}")
        for error in result["errors"]:
            print(f"ERROR: {error}")
        print(f"Validation: {len(result['errors'])} error(s), {len(result['warnings'])} warning(s)")
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
