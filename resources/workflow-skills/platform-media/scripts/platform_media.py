#!/usr/bin/env python3
import argparse
import json
import os
import urllib.error
import urllib.request


def env(name):
    value = os.environ.get(name, "")
    return value.strip() if isinstance(value, str) else ""


def media_url():
    url = env("CODEX_PLATFORM_MEDIA_URL")
    if not url:
        raise SystemExit("CODEX_PLATFORM_MEDIA_URL is missing.")
    return url


def platform_token():
    token = env("CODEX_PLATFORM_TOKEN")
    if not token:
        raise SystemExit("CODEX_PLATFORM_TOKEN is missing.")
    return token


def request_json(payload):
    body = json.dumps(payload or {}).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(media_url(), data=body, method="POST")
    req.add_header("Authorization", "Bearer " + platform_token())
    req.add_header("X-Ideart-Codex-Token", platform_token())
    req.add_header("Accept", "application/json")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            text = resp.read().decode("utf-8", "replace")
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        try:
            data = json.loads(text)
            message = data.get("error", {}).get("message") if isinstance(data.get("error"), dict) else data.get("error") or data.get("message") or text
        except Exception:
            message = text
        raise SystemExit(f"Platform media error {exc.code}: {message}")


def print_result(data):
    outputs = data.get("outputs") if isinstance(data, dict) else []
    media_type = data.get("type") if isinstance(data, dict) else ""
    parameters = data.get("parameters") if isinstance(data, dict) else {}
    if not isinstance(outputs, list):
        outputs = []
    public_outputs = []
    for item in outputs:
        if not isinstance(item, dict):
            continue
        url = item.get("viewUrl") or item.get("url")
        if not url:
            continue
        public_outputs.append({"url": url})
    print(json.dumps({"ok": bool(data.get("ok")) if isinstance(data, dict) else False, "type": media_type, "parameters": parameters, "outputs": public_outputs}, ensure_ascii=False, indent=2))
    for item in public_outputs:
        url = item.get("url")
        if not url:
            continue
        if media_type == "image":
            print(f"![generated image]({url})")
        elif media_type == "video":
            print(f"![generated video]({url})")
        elif media_type == "audio":
            print(f"![generated audio]({url})")
        else:
            print(url)


def parse_params(values):
    result = {}
    for item in values or []:
        if "=" not in item:
            raise SystemExit("--param must use key=value")
        key, raw = item.split("=", 1)
        key = key.strip()
        if not key:
            raise SystemExit("--param key is required")
        try:
            result[key] = json.loads(raw)
        except Exception:
            result[key] = raw
    return result


def run(args):
    payload = {
        "output_type": args.kind,
        "prompt": args.prompt,
        "codex_task_id": args.codex_task_id or "",
        "project_id": args.project_id or "",
        "team_id": args.team_id or "",
        "aspect_ratio": args.aspect_ratio or "",
        "resolution": args.resolution or "",
        "quality": args.quality or "",
        "duration": args.duration,
        "count": args.count,
        "model": args.model or "",
        "provider": args.provider or "",
        "reference_images": args.image or [],
        "reference_videos": args.video or [],
        "reference_audios": args.audio or [],
        "options": parse_params(args.param),
    }
    print_result(request_json(payload))


def main():
    parser = argparse.ArgumentParser(description="Generate media through 造梦 platform model configuration and billing.")
    sub = parser.add_subparsers(dest="kind", required=True)
    for kind in ("image", "video", "audio", "3d"):
        p = sub.add_parser(kind)
        p.add_argument("--prompt", required=True)
        p.add_argument("--codex-task-id", default="")
        p.add_argument("--project-id", default="")
        p.add_argument("--team-id", default="")
        p.add_argument("--aspect-ratio", default="")
        p.add_argument("--resolution", default="")
        p.add_argument("--quality", default="")
        p.add_argument("--duration", type=float, default=0)
        p.add_argument("--count", type=int, default=1)
        p.add_argument("--model", default="")
        p.add_argument("--provider", default="")
        p.add_argument("--image", action="append", default=[])
        p.add_argument("--video", action="append", default=[])
        p.add_argument("--audio", action="append", default=[])
        p.add_argument("--param", action="append", default=[])
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
