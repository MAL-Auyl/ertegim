# Ертегім

Интерактивная голосовая сказка: ребёнок 3–7 лет отвечает голосом и влияет на сюжет, реплики на казахском с русским подстрочником. Подробнее об идее — [IDEA.md](IDEA.md).

## Структура

| Каталог | Назначение |
|---|---|
| `public/` | детское приложение (статика), деплоится Vercel |
| `api/` | Vercel Edge functions (`transcribe.js`) |
| `server/` | локальный Bun-сервер: `server.js`, `bins.js` |
| `lib/` | модули без DOM/Bun-зависимостей (blocklist, STT-подсказки) |
| `tools/` | `prerender.py`, `dump-story.js`, `requirements.txt` |
| `tests/` | `bun test` |
| `docs/` | сценарий, статус-отчёты, спеки |

## Быстрый старт

```
cp .env.example .env   # вписать GROQ_API_KEY
bun server/server.js
```

Открыть `http://localhost:3000`. Панель оператора (скрыта от ребёнка) — клавиша `` ` ``,
значок ⚙ в шапке, либо параметр `?op=1` в URL.

Без `GROQ_API_KEY` и/или без ffmpeg/whisper/piper приложение всё ещё работает: живой STT и
live-TTS отключаются, но заранее пре-рендеренные `.wav` в `public/audio/` и ручные кнопки
оператора (✅/🔁/⏭) позволяют пройти историю без микрофона.

## Переменные окружения

Порядок разрешения бинарей: явный env → PATH → tools/.venv (для `PIPER_BIN` — сначала
`tools/.venv`, затем PATH) (см. `server/bins.js`).

| Переменная | По умолчанию | Если не задана/не найдена |
|---|---|---|
| `GROQ_API_KEY` | — | нет STT (Whisper) и LLM-классификатора ответов |
| `PORT` | `3000` | сервер слушает 3000 |
| `FFMPEG_BIN` | `ffmpeg` из PATH, иначе бинарь `imageio-ffmpeg` из `tools/.venv` | нет loudnorm-препроцессинга и pitch-shift для TTS, локальный Whisper недоступен |
| `WHISPER_BIN` | `whisper-cli` из PATH | только Groq STT |
| `WHISPER_MODEL` | `tools/models/ggml-small.bin`, если существует | только Groq STT |
| `PIPER_BIN` | `tools/.venv/bin/piper` (Windows: `tools/.venv/Scripts/piper.exe`), иначе `piper` из PATH | `/api/speak` отвечает 503, клиент переключается на пре-рендеренные `.wav` |
| `PIPER_VOICE_KK` | `tools/voices/kk_KZ-issai-high.onnx`, если существует | как выше |

## Озвучка (пререндер)

```
python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt
tools/.venv/bin/python tools/prerender.py
```

Скачает голос Piper в `tools/voices/` и озвучит все реплики истории в `public/audio/`.
`--force` — переозвучить всё заново; `--only id1,id2` — только перечисленные реплики.

## Тесты

```
bun test
```

## Деплой

Vercel zero-config: `public/` как статика, `api/` как Edge functions. В настройках проекта
на Vercel задать переменную `GROQ_API_KEY`. Live TTS (`/api/speak`) на Vercel недоступен —
используются только пре-рендеренные `.wav`. На Vercel также нет ни живого TTS, ни
LLM-классификатора (`/api/classify` есть только у локального сервера) — ответ ребёнка
оценивает локальный классификатор в браузере (`classify-local.js`).

`public/voices.html` — dev-страница для подбора голоса Piper, работает только с локальным
сервером.

## Что проверять на реальном устройстве

- STT и LLM-классификацию живьём (Groq): распознавание и разбор детских ответов.
- Pre-roll (обрезание первого согласного в записи).
- VAD-пороги записи на реальных детях, а не на взрослом голосе.
- Казахские реплики (`q_fork`, `q_courage`, `echo_reveal`, `thanks`) — носителем языка.

## Документы

- [docs/story-script.md](docs/story-script.md) — сценарий истории.
- [docs/status-report-2026-09-17.md](docs/status-report-2026-09-17.md) — статус-отчёт.
- [docs/superpowers/specs/](docs/superpowers/specs/) — спеки этапов разработки.
