#!/usr/bin/env bash
# Дообучает Piper (medium) на подготовленном дикторе.
# Первый запуск стартует с базового чекпоинта, повторный — продолжает с last.ckpt.
# Остановить можно в любой момент Ctrl+C: чекпоинты сохраняются каждую эпоху.
# Следить за обучением: $VENV/bin/tensorboard --logdir "$TRAIN_DIR"
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/config.env"

[ -f "$DATA_DIR/metadata.csv" ] || { echo "нет $DATA_DIR/metadata.csv — сначала ./02_prepare.sh" >&2; exit 1; }
mkdir -p "$TRAIN_DIR" "$WORK/base"

# Базовый чекпоинт: имя файла вида epoch=4139-step=929464.ckpt, узнаём его из листинга HF.
base_dir="$WORK/base/$(echo "$BASE_CKPT" | tr / _)"
mkdir -p "$base_dir"
base_ckpt=$(ls "$base_dir"/*.ckpt 2>/dev/null | head -1 || true)
if [ -z "$base_ckpt" ]; then
  name=$(curl -fsL "https://huggingface.co/api/datasets/rhasspy/piper-checkpoints/tree/main/$BASE_CKPT" \
    | python3 -c "import json,sys;print(next(x['path'].rsplit('/',1)[1] for x in json.load(sys.stdin) if x['path'].endswith('.ckpt')))")
  echo "скачиваю базовый чекпоинт $BASE_CKPT/$name"
  curl -fL --retry 5 -C - -o "$base_dir/$name.part" "$HF_CKPTS/$BASE_CKPT/$name"
  mv "$base_dir/$name.part" "$base_dir/$name"
  base_ckpt="$base_dir/$name"
fi

# Lightning восстанавливает номер эпохи из чекпоинта, поэтому предел эпох
# считаем от эпохи базовой модели и запоминаем при первом запуске.
if [ ! -f "$TRAIN_DIR/max_epochs" ]; then
  base_epoch=$(basename "$base_ckpt" | sed -E 's/^epoch=([0-9]+).*/\1/')
  echo $((base_epoch + EXTRA_EPOCHS)) > "$TRAIN_DIR/max_epochs"
fi
max_epochs=$(cat "$TRAIN_DIR/max_epochs")

resume=$(ls -t "$TRAIN_DIR"/lightning_logs/version_*/checkpoints/last.ckpt 2>/dev/null | head -1 || true)
ckpt="${resume:-$base_ckpt}"
echo "старт с: $ckpt"
echo "до эпохи: $max_epochs"

"$VENV/bin/python" -m piper.train fit \
  --data.voice_name "$VOICE_NAME" \
  --data.csv_path "$DATA_DIR/metadata.csv" \
  --data.audio_dir "$DATA_DIR/wav" \
  --model.sample_rate 22050 \
  --data.espeak_voice "$ESPEAK_VOICE" \
  --data.cache_dir "$TRAIN_DIR/cache" \
  --data.config_path "$TRAIN_DIR/config.json" \
  --data.batch_size "$BATCH_SIZE" \
  --data.validation_split 0.02 \
  --data.num_workers 4 \
  --trainer.accelerator gpu \
  --trainer.devices 1 \
  --trainer.max_epochs "$max_epochs" \
  --trainer.default_root_dir "$TRAIN_DIR" \
  --ckpt_path "$ckpt" \
  "$@"
