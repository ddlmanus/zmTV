#!/usr/bin/env python3
import argparse
import json
import math
import mimetypes
import os
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    Image = None
    ImageDraw = None
    ImageOps = None
    PIL_AVAILABLE = False


MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
MEDIA_URL_KEYS = {
    "url",
    "mediaurl",
    "imageurl",
    "videourl",
    "audiourl",
    "thumbnailurl",
    "playlistexporturl",
}


def media_tool(name):
    env_name = "FFPROBE_PATH" if name == "ffprobe" else "FFMPEG_PATH"
    configured = str(os.environ.get(env_name, "")).strip()
    if configured and Path(configured).is_file():
        return configured
    return shutil.which(name)


def safe_name(value, fallback):
    name = Path(urllib.parse.urlparse(value).path).name or fallback
    return "".join(ch if ch.isalnum() or ch in ".-_" else "_" for ch in name)[:120] or fallback


def collect_result_sources(value, key=""):
    sources = []
    if isinstance(value, dict):
        for child_key, child_value in value.items():
            normalized_key = "".join(ch for ch in str(child_key).lower() if ch.isalnum())
            if normalized_key in MEDIA_URL_KEYS and isinstance(child_value, str) and child_value.strip():
                sources.append(child_value.strip())
            else:
                sources.extend(collect_result_sources(child_value, normalized_key))
    elif isinstance(value, list):
        for item in value:
            sources.extend(collect_result_sources(item, key))
    return sources


def load_result_sources(file_path):
    path = Path(file_path).expanduser().resolve()
    if not path.is_file():
        raise RuntimeError(f"Result JSON file not found: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    return collect_result_sources(value)


def materialize(source, directory, index):
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        target = directory / safe_name(source, f"remote-{index}.bin")
        request = urllib.request.Request(source, headers={"User-Agent": "ZaomengMediaQA/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response, target.open("wb") as output:
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_DOWNLOAD_BYTES:
                    raise RuntimeError(f"Media exceeds {MAX_DOWNLOAD_BYTES} bytes: {source}")
                output.write(chunk)
        return target
    path = Path(source).expanduser().resolve()
    if not path.is_file():
        raise RuntimeError(f"Media file not found: {source}")
    return path


def is_image(path):
    if not PIL_AVAILABLE:
        mime = mimetypes.guess_type(path.name)[0] or ""
        return mime.startswith("image/") or path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif"}
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except Exception:
        return False


def media_kind(path):
    if is_image(path):
        return "image"
    mime = mimetypes.guess_type(path.name)[0] or ""
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    suffix = path.suffix.lower()
    if suffix in {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}:
        return "video"
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}:
        return "audio"
    return "unknown"


def run(command):
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def probe_duration(path):
    ffprobe = media_tool("ffprobe")
    if not ffprobe:
        return 0.0
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=False,
        capture_output=True,
        text=True,
    )
    try:
        return max(0.0, float(result.stdout.strip()))
    except Exception:
        return 0.0


def extract_video_frames(path, directory, label):
    ffmpeg = media_tool("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to build video QA previews")
    duration = probe_duration(path)
    ratios = (0.1, 0.5, 0.9) if duration > 0.5 else (0.0,)
    frames = []
    for frame_index, ratio in enumerate(ratios):
        target = directory / f"video-{len(list(directory.glob('video-*.jpg'))):04d}-{frame_index}.jpg"
        timestamp = max(0.0, duration * ratio)
        run([
            ffmpeg,
            "-y",
            "-ss",
            f"{timestamp:.3f}",
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-vf",
            "scale=960:-2:force_original_aspect_ratio=decrease",
            "-q:v",
            "5",
            str(target),
        ])
        frames.append((target, f"{label} {round(ratio * 100)}%"))
    return frames


def extract_audio_waveform(path, directory, label):
    ffmpeg = media_tool("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to build audio QA previews")
    target = directory / f"audio-{len(list(directory.glob('audio-*.png'))):04d}.png"
    run([
        ffmpeg,
        "-y",
        "-i",
        str(path),
        "-filter_complex",
        "aformat=channel_layouts=mono,showwavespic=s=960x320:colors=0x2f6feb",
        "-frames:v",
        "1",
        str(target),
    ])
    return [(target, label)]


def normalize_image_preview(path, directory, label):
    ffmpeg = media_tool("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to build image QA previews when Pillow is unavailable")
    target = directory / f"image-{len(list(directory.glob('image-*.jpg'))):04d}.jpg"
    run([
        ffmpeg,
        "-y",
        "-i",
        str(path),
        "-frames:v",
        "1",
        "-vf",
        "scale=960:-2:force_original_aspect_ratio=decrease",
        "-q:v",
        "5",
        str(target),
    ])
    return [(target, label)]


def preview_sources(sources, workdir):
    previews = []
    failures = []
    for index, source in enumerate(sources):
        label = safe_name(source, f"media-{index + 1}")
        try:
            path = materialize(source, workdir, index)
            kind = media_kind(path)
            if kind == "image":
                if PIL_AVAILABLE:
                    previews.append((path, label))
                else:
                    previews.extend(normalize_image_preview(path, workdir, label))
            elif kind == "video":
                previews.extend(extract_video_frames(path, workdir, label))
            elif kind == "audio":
                previews.extend(extract_audio_waveform(path, workdir, label))
            else:
                failures.append({"source": source, "error": "unsupported media type"})
        except Exception as exc:
            failures.append({"source": source, "error": str(exc)})
    return previews, failures


def make_sheet(items, target, max_side):
    if not PIL_AVAILABLE:
        make_sheet_with_ffmpeg(items, target, max_side)
        return
    columns = min(4, max(1, math.ceil(math.sqrt(len(items)))))
    rows = math.ceil(len(items) / columns)
    label_height = 34
    cell_size = max_side + 24
    sheet = Image.new("RGB", (columns * cell_size, rows * (cell_size + label_height)), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (path, label) in enumerate(items):
        row, column = divmod(index, columns)
        left = column * cell_size
        top = row * (cell_size + label_height)
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            x = left + (cell_size - image.width) // 2
            y = top + (cell_size - image.height) // 2
            sheet.paste(image, (x, y))
        draw.text((left + 8, top + cell_size + 8), f"{index + 1}. {label[:70]}", fill="#202124")
    sheet.save(target, format="JPEG", quality=68, optimize=True, progressive=True)


def make_sheet_with_ffmpeg(items, target, max_side):
    ffmpeg = media_tool("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to build QA contact sheets when Pillow is unavailable")
    columns = min(4, max(1, math.ceil(math.sqrt(len(items)))))
    cell_size = max_side + 24
    command = [ffmpeg, "-y"]
    for path, _label in items:
        command.extend(["-i", str(path)])
    filters = []
    labels = []
    layout = []
    for index in range(len(items)):
        row, column = divmod(index, columns)
        labels.append(f"v{index}")
        layout.append(f"{column * cell_size}_{row * cell_size}")
        filters.append(
            f"[{index}:v]scale={max_side}:{max_side}:force_original_aspect_ratio=decrease,"
            f"pad={cell_size}:{cell_size}:(ow-iw)/2:(oh-ih)/2:color=white[v{index}]"
        )
    if len(items) == 1:
        filters.append("[v0]null[out]")
    else:
        inputs = "".join(f"[{label}]" for label in labels)
        filters.append(f"{inputs}xstack=inputs={len(items)}:layout={'|'.join(layout)}:fill=white[out]")
    command.extend([
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-frames:v",
        "1",
        "-q:v",
        "5",
        str(target),
    ])
    run(command)


def main():
    parser = argparse.ArgumentParser(description="Build compact contact sheets for Codex media QA without loading full-resolution originals into context.")
    parser.add_argument("--input", action="append", default=[], help="Local path or HTTP(S) URL. Repeat for multiple media files.")
    parser.add_argument("--result-json", action="append", default=[], help="Canvas command result JSON. Media URLs are discovered automatically.")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--max-side", type=int, default=420)
    parser.add_argument("--per-sheet", type=int, default=16)
    args = parser.parse_args()

    sources = list(args.input)
    for result_json in args.result_json:
        sources.extend(load_result_sources(result_json))
    sources = list(dict.fromkeys(source for source in sources if str(source).strip()))
    if not sources:
        raise SystemExit("Provide --input or --result-json with at least one media result.")
    if not PIL_AVAILABLE and not media_tool("ffmpeg"):
        print(json.dumps({
            "status": "dependency_unavailable",
            "dependency": "Pillow or ffmpeg",
            "inputCount": len(sources),
            "previewCount": 0,
            "sheetCount": 0,
            "sheets": [],
            "failures": [],
            "message": "Media QA preview is unavailable in this runtime. Do not install packages during the Codex turn.",
        }, ensure_ascii=False, separators=(",", ":")))
        return
    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else Path(tempfile.mkdtemp(prefix="zaomeng-media-qa-"))
    output_dir.mkdir(parents=True, exist_ok=True)
    workdir = output_dir / "sources"
    workdir.mkdir(parents=True, exist_ok=True)
    previews, failures = preview_sources(sources, workdir)
    per_sheet = max(1, min(25, args.per_sheet))
    max_side = max(160, min(640, args.max_side))
    sheets = []
    for offset in range(0, len(previews), per_sheet):
        target = output_dir / f"contact-sheet-{offset // per_sheet + 1:03d}.jpg"
        make_sheet(previews[offset:offset + per_sheet], target, max_side)
        sheets.append(str(target))
    print(json.dumps({
        "status": "ok" if previews and not failures else "partial" if previews else "failed",
        "renderer": "pillow" if PIL_AVAILABLE else "ffmpeg",
        "inputCount": len(sources),
        "previewCount": len(previews),
        "sheetCount": len(sheets),
        "sheets": sheets,
        "failures": failures,
    }, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
