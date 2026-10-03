#!/usr/bin/env bash
# Озвучивает реплики сказки старым и новым голосом для сравнения на слух.
# Файлы: tools/voices/samples/{old,new}/<id>.wav — открываются из Проводника Windows.
#   ./05_samples.sh          — первые 12 реплик
#   N=0 ./05_samples.sh      — все реплики
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/config.env"
REPO="$(cd "$HERE/../.." && pwd)"
VOICES="$REPO/tools/voices"
OUT="$VOICES/samples"
: "${N:=12}"

NEW="$VOICES/$VOICE_NAME.onnx"
OLD="$VOICES/kk_KZ-issai-high.onnx"
[ -f "$NEW" ] || { echo "нет $NEW — сначала ./04_export.sh" >&2; exit 1; }

# Реплики берём из самой сказки через tools/dump-story.js. В WSL подойдёт и
# node из Linux, и node.exe из Windows (тогда путь передаём в виде C:\...).
dump="$REPO/tools/dump-story.js"
if command -v node >/dev/null; then
  lines_json=$(node "$dump")
elif command -v node.exe >/dev/null; then
  lines_json=$(node.exe "$(wslpath -w "$dump")")
else
  echo "нужен node (в WSL: sudo apt install nodejs) или node.exe из Windows в PATH" >&2
  exit 1
fi

mkdir -p "$OUT/new" "$OUT/old"
echo "$lines_json" | N="$N" "$VENV/bin/python" -c '
import json, os, sys
lines = list(json.load(sys.stdin).items())
n = int(os.environ["N"])
for audio_id, text in (lines[:n] if n else lines):
    print(audio_id + "\t" + text.replace("\n", " "))
' | while IFS=$'\t' read -r id text; do
  echo "$text" | "$VENV/bin/python" -m piper -m "$NEW" -f "$OUT/new/$id.wav" >/dev/null 2>&1
  if [ -f "$OLD" ]; then
    # Старый голос — ровно как в tools/prerender.py: speaker 3 + подъём тона ffmpeg.
    echo "$text" | "$VENV/bin/python" -m piper -m "$OLD" -s 3 -f "$OUT/old/$id.raw.wav" >/dev/null 2>&1
    ffmpeg -nostdin -y -loglevel error -i "$OUT/old/$id.raw.wav" \
      -af "asetrate=22050*$PITCH,aresample=22050,atempo=$(python3 -c "print(1/$PITCH)")" "$OUT/old/$id.wav"
    rm -f "$OUT/old/$id.raw.wav"
  fi
  echo "  $id"
done

echo "Готово: $(wslpath -w "$OUT" 2>/dev/null || echo "$OUT")"
