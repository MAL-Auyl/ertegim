#!/usr/bin/env bash
# Скачивает KazakhTTS2 (6 частей, ~36 ГБ) и распаковывает только нужного диктора.
# Докачка работает: оборванную загрузку можно просто перезапустить.
# DELETE_PARTS=1 — удалить архив после распаковки (понадобится снова для другого диктора).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/config.env"
: "${DELETE_PARTS:=0}"

PARTS=(aa ab ac ad ae af)
mkdir -p "$RAW_DIR"

for p in "${PARTS[@]}"; do
  f="$RAW_DIR/ISSAI_KazakhTTS2.tar.gz.part$p"
  if [ -f "$f.done" ]; then
    echo "part$p уже скачана"
    continue
  fi
  echo "скачиваю part$p"
  curl -fL --retry 5 --retry-delay 10 -C - -o "$f" \
    "$HF_KAZAKHTTS/ISSAI_KazakhTTS2_by_parts/ISSAI_KazakhTTS2.tar.gz.part$p"
  touch "$f.done"
done

OUT="$RAW_DIR/ISSAI_KazakhTTS2/$SPEAKER"
if [ -d "$OUT/Audio" ] && [ -f "$OUT/.extracted" ]; then
  echo "$SPEAKER уже распакован в $OUT"
else
  echo "распаковываю диктора $SPEAKER (архив читается целиком, это займёт время)"
  cat "$RAW_DIR"/ISSAI_KazakhTTS2.tar.gz.part?? \
    | tar -xzf - -C "$RAW_DIR" --wildcards \
        "ISSAI_KazakhTTS2/$SPEAKER/*" "ISSAI_KazakhTTS2/speaker_metadata.txt"
  touch "$OUT/.extracted"
fi

n_wav=$(find "$OUT/Audio" -name '*.wav' | wc -l)
echo "$SPEAKER: $n_wav записей в $OUT"

if [ "$DELETE_PARTS" = "1" ]; then
  rm -f "$RAW_DIR"/ISSAI_KazakhTTS2.tar.gz.part??{,.done}
  echo "архив удалён"
fi
echo "Дальше: ./02_prepare.sh"
