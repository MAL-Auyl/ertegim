#!/usr/bin/env bash
# Экспортирует чекпоинт в ONNX и кладёт голос в tools/voices/ рядом с нынешним.
#   ./04_export.sh                    — последний чекпоинт (last.ckpt)
#   ./04_export.sh path/to/x.ckpt     — конкретный (например, лучший по val_mos)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/config.env"
REPO="$(cd "$HERE/../.." && pwd)"
VOICES="$REPO/tools/voices"

ckpt="${1:-$(ls -t "$TRAIN_DIR"/lightning_logs/version_*/checkpoints/last.ckpt 2>/dev/null | head -1 || true)}"
[ -n "$ckpt" ] && [ -f "$ckpt" ] || { echo "чекпоинт не найден — сначала ./03_train.sh" >&2; exit 1; }
[ -f "$TRAIN_DIR/config.json" ] || { echo "нет $TRAIN_DIR/config.json" >&2; exit 1; }

mkdir -p "$VOICES"
echo "экспорт $ckpt"
"$VENV/bin/python" -m piper.train.export_onnx --checkpoint "$ckpt" --output-file "$VOICES/$VOICE_NAME.onnx"
cp "$TRAIN_DIR/config.json" "$VOICES/$VOICE_NAME.onnx.json"
echo "$ckpt" > "$VOICES/$VOICE_NAME.source.txt"
ls -lh "$VOICES/$VOICE_NAME".onnx*
echo "Дальше: ./05_samples.sh — сравнить со старым голосом"
