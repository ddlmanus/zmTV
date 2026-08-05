#!/usr/bin/env python3
"""Validate a novel-to-film project's manifest and completion claims."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


COMPLETE_STATES = {"approved", "complete", "completed", "passed"}


def _state(value: Any) -> str:
    return str(value or "").strip().lower()


def _path_from(item: dict[str, Any]) -> str:
    return str(item.get("path") or item.get("file") or item.get("output") or "").strip()


def _check_file(root: Path, relative: str, label: str, errors: list[str]) -> None:
    if not relative:
        errors.append(f"{label}: missing path")
        return
    candidate = Path(relative)
    path = candidate if candidate.is_absolute() else root / candidate
    if not path.is_file():
        errors.append(f"{label}: file does not exist: {path}")
    elif path.stat().st_size <= 0:
        errors.append(f"{label}: file is empty: {path}")


def _probe_mp4(root: Path, relative: str, errors: list[str], warnings: list[str]) -> None:
    if not relative:
        return
    candidate = Path(relative)
    path = candidate if candidate.is_absolute() else root / candidate
    if not path.is_file() or path.stat().st_size <= 0:
        return
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        warnings.append("ffprobe is unavailable; final_mp4 decode check was skipped")
        return
    probe = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,r_frame_rate,duration",
            "-of", "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if probe.returncode != 0:
        errors.append(f"final_mp4 is not decodable: {probe.stderr.strip() or path}")
        return
    try:
        payload = json.loads(probe.stdout)
    except json.JSONDecodeError:
        errors.append("final_mp4 ffprobe output is invalid")
        return
    if not payload.get("streams"):
        errors.append("final_mp4 has no decodable video stream")


def _unique_ids(items: list[Any], label: str, errors: list[str]) -> set[str]:
    seen: set[str] = set()
    for index, raw in enumerate(items):
        if not isinstance(raw, dict):
            errors.append(f"{label}[{index}] must be an object")
            continue
        item_id = str(raw.get("id") or raw.get(f"{label[:-1]}Id") or "").strip()
        if not item_id:
            errors.append(f"{label}[{index}] is missing an id")
        elif item_id in seen:
            errors.append(f"{label}: duplicate id {item_id}")
        else:
            seen.add(item_id)
    return seen


def validate_manifest(root: Path, manifest: dict[str, Any], mode: str) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    project = manifest.get("project")
    if not isinstance(project, dict):
        errors.append("project must be an object")
    else:
        for key in ("name", "format", "language"):
            if not str(project.get(key) or "").strip():
                errors.append(f"project.{key} is required")

    sources = manifest.get("sources")
    if not isinstance(sources, list) or not sources:
        errors.append("sources must contain at least one authorized source")
        sources = []
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            continue
        if not str(source.get("sha256") or "").strip():
            warnings.append(f"sources[{index}] has no sha256")
        if not str(source.get("authorization") or "").strip():
            warnings.append(f"sources[{index}] has no authorization note")

    canon = manifest.get("canon")
    if not isinstance(canon, dict):
        errors.append("canon must be an object")

    episodes = manifest.get("episodes")
    assets = manifest.get("assets")
    shots = manifest.get("shots")
    deliverables = manifest.get("deliverables")
    for name, value in (
        ("episodes", episodes),
        ("assets", assets),
        ("shots", shots),
        ("deliverables", deliverables),
    ):
        if not isinstance(value, list):
            errors.append(f"{name} must be an array")

    episodes = episodes if isinstance(episodes, list) else []
    assets = assets if isinstance(assets, list) else []
    shots = shots if isinstance(shots, list) else []
    deliverables = deliverables if isinstance(deliverables, list) else []
    episode_ids = _unique_ids(episodes, "episodes", errors)
    asset_ids = _unique_ids(assets, "assets", errors)
    _unique_ids(shots, "shots", errors)
    _unique_ids(deliverables, "deliverables", errors)

    for index, raw in enumerate(shots):
        if not isinstance(raw, dict):
            continue
        shot_id = str(raw.get("id") or raw.get("shotId") or index)
        episode_id = str(raw.get("episodeId") or "").strip()
        if episode_id and episode_id not in episode_ids:
            errors.append(f"shot {shot_id}: unknown episodeId {episode_id}")
        for asset_id in raw.get("assetIds") or []:
            if str(asset_id) not in asset_ids:
                errors.append(f"shot {shot_id}: unknown assetId {asset_id}")
        duration = raw.get("durationSeconds")
        if duration is not None:
            try:
                if float(duration) <= 0:
                    errors.append(f"shot {shot_id}: durationSeconds must be positive")
            except (TypeError, ValueError):
                errors.append(f"shot {shot_id}: durationSeconds must be numeric")
        keyframes = raw.get("keyframes")
        if mode in {"ready-to-render", "complete"}:
            if not isinstance(keyframes, list) or not keyframes:
                errors.append(f"shot {shot_id}: missing keyframes")
            elif len(keyframes) < 2 and not str(raw.get("staticReason") or "").strip():
                errors.append(f"shot {shot_id}: fewer than two keyframes without staticReason")

    if mode in {"ready-to-render", "complete"}:
        if not episodes:
            errors.append("no episodes are defined")
        if not shots:
            errors.append("no shots are defined")
        for raw in assets:
            if not isinstance(raw, dict):
                continue
            if raw.get("required", True) and _state(raw.get("status")) not in COMPLETE_STATES:
                errors.append(f"asset {raw.get('id')}: required asset is not approved")
        for raw in shots:
            if not isinstance(raw, dict):
                continue
            shot_id = raw.get("id") or raw.get("shotId")
            video = raw.get("video")
            if not isinstance(video, dict):
                errors.append(f"shot {shot_id}: missing video record")
                continue
            if _state(video.get("status")) not in COMPLETE_STATES:
                errors.append(f"shot {shot_id}: video is not approved")
            _check_file(root, _path_from(video), f"shot {shot_id} video", errors)

    if mode == "complete":
        for raw in episodes:
            if isinstance(raw, dict) and _state(raw.get("status")) not in COMPLETE_STATES:
                errors.append(f"episode {raw.get('id')}: not complete")

        final_candidates = [
            item for item in deliverables
            if isinstance(item, dict)
            and str(item.get("type") or item.get("id") or "").lower() in {
                "final_mp4", "final-mp4", "master_mp4", "master-mp4"
            }
        ]
        if not final_candidates:
            errors.append("deliverables: missing final_mp4")
        for final in final_candidates:
            if _state(final.get("status")) not in COMPLETE_STATES:
                errors.append("final_mp4 is not approved")
            _check_file(root, _path_from(final), "final_mp4", errors)
            _probe_mp4(root, _path_from(final), errors, warnings)

        acceptance = manifest.get("acceptance")
        required_gates = {"source", "screenplay", "assets", "shots", "audio", "technical"}
        if not isinstance(acceptance, dict):
            errors.append("acceptance must contain six final gates")
        else:
            missing = sorted(required_gates - set(acceptance))
            if missing:
                errors.append("acceptance is missing gates: " + ", ".join(missing))
            for gate in sorted(required_gates & set(acceptance)):
                if _state(acceptance.get(gate)) not in COMPLETE_STATES:
                    errors.append(f"acceptance.{gate} is not passed")

    return {"errors": errors, "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", help="Novel-film project directory")
    parser.add_argument(
        "--mode",
        choices=("structure", "ready-to-render", "complete"),
        default="structure",
        help="Validation depth",
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    manifest_path = root / "production" / "novel-film-manifest.json"
    if not manifest_path.is_file():
        result = {"errors": [f"manifest does not exist: {manifest_path}"], "warnings": []}
    else:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            result = {"errors": [f"cannot read manifest: {exc}"], "warnings": []}
        else:
            if not isinstance(manifest, dict):
                result = {"errors": ["manifest root must be an object"], "warnings": []}
            else:
                result = validate_manifest(root, manifest, args.mode)

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
