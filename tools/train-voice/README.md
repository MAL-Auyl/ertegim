# Свой голос героя (дообучение Piper)

Дообучаем Piper на одном дикторе открытого корпуса
[KazakhTTS2](https://huggingface.co/datasets/issai/KazakhTTS) (ISSAI, 271 ч, 5 дикторов).
Подъём тона ×1.4, который сейчас делает ffmpeg в `tools/prerender.py` и
`server/server.js`, «вшивается» прямо в обучающие записи. На выходе получается
одноголосая модель `tools/voices/kk_KZ-ertegim-medium.onnx`, которая сразу звучит как
лисёнок, без пост-обработки и её артефактов.

Зачем, если `kk_KZ-issai-high` уже обучен на ISSAI: та модель многоголосая, и нужный
тембр получается только через pitch-shift. Здесь модель одна, под одного героя.

## Требования

- Windows + **WSL2 Ubuntu**. В PowerShell от администратора: `wsl --install -d Ubuntu`,
  затем перезагрузка.
- Драйвер NVIDIA в Windows, WSL берёт его оттуда. Проверка в WSL: `nvidia-smi`.
- ~60 ГБ свободного места: архив 36 ГБ, диктор после распаковки, кэш и чекпоинты.
  Архив можно удалить после распаковки (`DELETE_PARTS=1`).

## Запуск

Всё выполняется в терминале Ubuntu (WSL). Репозиторий лежит на диске Windows, а
тяжёлые данные складываются в `~/ertegim-voice` внутри WSL: так обучение в разы быстрее.

```bash
cd /mnt/c/Users/zoomy/ertegim/tools/train-voice

./00_setup.sh      # пакеты, piper1-gpl v1.8.0, PyTorch; проверка CUDA  (~10 мин)
./01_download.sh   # KazakhTTS2 36 ГБ + распаковка диктора F1           (зависит от сети)
./02_prepare.sh    # отбор 30 ч, подъём тона, metadata.csv              (~20–40 мин)
./03_train.sh      # дообучение на GPU, Ctrl+C — пауза, повторный запуск — продолжение
./04_export.sh     # чекпоинт → tools/voices/kk_KZ-ertegim-medium.onnx
./05_samples.sh    # реплики сказки старым и новым голосом → tools/voices/samples/
```

Все настройки лежат в `config.env`, любую можно переопределить на лету:

```bash
SPEAKER=F2 ./02_prepare.sh && SPEAKER=F2 ./03_train.sh
```

| Параметр | По умолчанию | Что значит |
|---|---|---|
| `SPEAKER` | `F1` | диктор KazakhTTS2: F1/F2/F3 — женские, M1/M2 — мужские |
| `PITCH` | `1.4` | подъём тона в данных (`1.0` — родной голос диктора) |
| `MAX_HOURS` | `30` | сколько часов записи брать |
| `BATCH_SIZE` | `16` | под 16 ГБ VRAM; при нехватке памяти (OOM) — `8` |
| `EXTRA_EPOCHS` | `150` | эпох дообучения поверх базового чекпоинта |
| `BASE_CKPT` | `ru/ru_RU/irina/medium` | стартовый чекпоинт: казахского нет, берём русский женский |
| `WORK` | `~/ertegim-voice` | куда складывать данные и чекпоинты |

## Как понять, что голос готов

- Каждую эпоху сохраняются `last.ckpt` и 5 лучших по `val_mel` и `val_mos` в
  `~/ertegim-voice/train/F1/lightning_logs/version_*/checkpoints/`.
- Графики: `~/ertegim-voice/venv/bin/tensorboard --logdir ~/ertegim-voice/train/F1`.
- Главный критерий — слух. `val_mel` перестаёт падать рано, а артефакты уходят
  дольше. Примерно раз в 20–30 эпох можно запускать `./04_export.sh && ./05_samples.sh`
  и сравнивать `samples/old` и `samples/new`. Обучение при этом можно не останавливать:
  экспорт читает `last.ckpt`.
- Лучший чекпоинт по `val_mos` экспортируется так:
  `./04_export.sh ~/ertegim-voice/train/F1/lightning_logs/version_0/checkpoints/epoch=…-val_mos=….ckpt`

## Подключение к приложению

Пока не сделано: сначала нужно получить голос и одобрить его на слух. Потом останется:

1. В `tools/prerender.py` и `server/server.js` при новом голосе не передавать `--speaker`
   (модель одноголосая) и выключить pitch-shift (`PITCH = 1.0`): тон уже в модели.
2. Указать `PIPER_VOICE_KK=tools/voices/kk_KZ-ertegim-medium.onnx`.
3. Переозвучить: `tools/.venv/Scripts/python tools/prerender.py --force`.

## Лицензии

- KazakhTTS2 — ISSAI, открытый корпус для академического и коммерческого использования.
  Точные условия нужно сверить перед релизом; в статье просят ссылку на
  [KazakhTTS2 (LREC 2022)](https://aclanthology.org/2022.lrec-1.578/).
- piper1-gpl — GPL-3.0 (код обучения). Сам обученный `.onnx` к GPL не привязан.
- Базовый чекпоинт `ru_RU-irina` — см. `MODEL_CARD` в
  [rhasspy/piper-checkpoints](https://huggingface.co/datasets/rhasspy/piper-checkpoints/tree/main/ru/ru_RU/irina/medium).
