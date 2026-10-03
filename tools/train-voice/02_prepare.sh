#!/usr/bin/env bash
# Готовит датасет диктора для Piper: отбор фраз, подъём тона, metadata.csv.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/config.env"

python3 "$HERE/prepare.py" \
  --src "$RAW_DIR/ISSAI_KazakhTTS2/$SPEAKER" \
  --out "$DATA_DIR" \
  --pitch "$PITCH" \
  --max-hours "$MAX_HOURS" \
  "$@"
echo "Дальше: ./03_train.sh"
