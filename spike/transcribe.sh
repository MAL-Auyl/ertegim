#!/usr/bin/env bash
# Day 1 spike (Next Steps #0): verify Whisper-large-v3-turbo via Groq against
# a real audio sample. Usage: ./spike/transcribe.sh path/to/audio.mp3 [language]
# language defaults to "kk" (Kazakh, ISO 639-1). Pass "ru" to test Russian instead.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && export "$(grep -v '^#' .env | xargs)"

if [ -z "${GROQ_API_KEY:-}" ]; then
  echo "GROQ_API_KEY not set — put it in .env (see .env.example), never in chat." >&2
  exit 1
fi

AUDIO="${1:?Usage: ./spike/transcribe.sh path/to/audio.mp3 [language]}"
LANG="${2:-kk}"

if [ ! -f "$AUDIO" ]; then
  echo "File not found: $AUDIO" >&2
  exit 1
fi

echo "Transcribing $AUDIO (language=$LANG, model=whisper-large-v3-turbo)..."
START=$(date +%s%N)

RESPONSE=$(curl -s -X POST "https://api.groq.com/openai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F "file=@$AUDIO" \
  -F "model=whisper-large-v3-turbo" \
  -F "language=$LANG" \
  -F "response_format=verbose_json")

END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))

echo "--- Response (${ELAPSED_MS}ms) ---"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
