#!/usr/bin/env bash
# Day 1 spike (Next Steps #0), local fallback: verify Whisper (small, multilingual)
# against a real audio sample, fully offline — no Groq account needed.
# Usage: ./spike/transcribe-local.sh path/to/audio.ext [language]
# language defaults to "kk" (Kazakh, ISO 639-1). Pass "ru" to test Russian instead.
set -euo pipefail

cd "$(dirname "$0")/.."
TOOLS="spike/tools"
FFMPEG=$(ls "$TOOLS"/ffmpeg-*win64-gpl*/bin/ffmpeg.exe 2>/dev/null | head -1)
WHISPER="$TOOLS/whisper-bin/Release/whisper-cli.exe"
MODEL="$TOOLS/ggml-small.bin"

for f in "$FFMPEG" "$WHISPER" "$MODEL"; do
  [ -f "$f" ] || { echo "Missing: $f — did setup finish?" >&2; exit 1; }
done

AUDIO="${1:?Usage: ./spike/transcribe-local.sh path/to/audio.ext [language]}"
LANG="${2:-kk}"

[ -f "$AUDIO" ] || { echo "File not found: $AUDIO" >&2; exit 1; }

WAV="spike/audio/_converted_16k.wav"
echo "Converting to 16kHz mono WAV..."
"$FFMPEG" -y -loglevel error -i "$AUDIO" -ar 16000 -ac 1 -c:a pcm_s16le "$WAV"

echo "Transcribing (language=$LANG, model=small)..."
START=$(date +%s%N)
"$WHISPER" -m "$MODEL" -l "$LANG" -f "$WAV" -otxt -of spike/audio/_result
END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))

echo "--- Transcript (${ELAPSED_MS}ms) ---"
cat spike/audio/_result.txt
