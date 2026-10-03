#!/usr/bin/env bash
# Ставит всё нужное для обучения: системные пакеты, piper1-gpl с train-extras,
# Cython-расширение monotonic_align. Запускать в WSL (Ubuntu). Повторный запуск безопасен.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/config.env"

if ! command -v nvidia-smi >/dev/null; then
  echo "nvidia-smi не найден: в WSL не видна видеокарта." >&2
  echo "Обнови драйвер NVIDIA в Windows (WSL берёт его оттуда), затем 'wsl --shutdown'." >&2
  exit 1
fi
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

sudo apt-get update
sudo apt-get install -y build-essential cmake ninja-build git curl ffmpeg \
  espeak-ng python3-venv python3-dev

mkdir -p "$WORK"
if [ ! -d "$PIPER_SRC/.git" ]; then
  git clone https://github.com/OHF-Voice/piper1-gpl.git "$PIPER_SRC"
fi
git -C "$PIPER_SRC" fetch --tags --quiet
git -C "$PIPER_SRC" checkout --quiet "$PIPER_REF"

if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --upgrade pip wheel
"$VENV/bin/pip" install -e "$PIPER_SRC[train]"

(cd "$PIPER_SRC" && source "$VENV/bin/activate" && ./build_monotonic_align.sh)

"$VENV/bin/python" - <<'PY'
import torch
assert torch.cuda.is_available(), "PyTorch не видит CUDA"
print("torch", torch.__version__, "cuda ok:", torch.cuda.get_device_name(0))
PY
echo "Готово. Дальше: ./01_download.sh"
