#!/usr/bin/env bash
set -euo pipefail

echo "Direct Gemini API analysis is disabled in the 造梦-integrated skill." >&2
echo "Use the current Codex/browser video-understanding workflow, or extract representative frames with ffmpeg and analyze them inside 造梦." >&2
echo "Do not request GEMINI_API_KEY or call an external provider directly." >&2
exit 2
