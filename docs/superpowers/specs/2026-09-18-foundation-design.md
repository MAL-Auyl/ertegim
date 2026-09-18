# Ертегім — этап «фундамент»: структура репо, кроссплатформенный сервер, README, CI

Дата: 2026-09-18. Статус: APPROVED (согласовано в чате).
Ветка: `story-and-parent-report` (после этапа 1b, HEAD 69d1870). Финиш: merge в `design-v2`, push.

## Цель

Один источник правды для приложения (сейчас два расходящихся `public/`, и Vercel деплоит
устаревший), локальный сервер, который запускается на Linux/macOS/Windows без правки кода,
README и CI, чтобы следующий человек (или следующая сессия) мог поднять проект за пять минут.

Не входит: новая функциональность, настоящий PIN, смена STT/TTS-движков.

## 1. Структура репо

Целевая:

```
public/          детское приложение (бывший app/public), деплоится Vercel как статика
api/             Vercel Edge functions (transcribe.js) — без изменений логики
server/          локальный Bun-сервер: server.js, bins.js, tmp/.gitkeep
lib/             модули без DOM/Bun: blocklist-core.js, stt-hints-core.js, blocklist-cli.js
tools/           prerender.py, dump-story.js, requirements.txt (venv/voices — gitignored)
tests/           bun test (бывший app/tests)
docs/            без изменений
package.json     корень: {"name":"ertegim","private":true,"type":"commonjs","scripts":{"test":"bun test"}}
```

Перемещения — через `git mv`, чтобы история сохранилась. Удаляются: старый корневой
`public/` (целиком, до `git mv`), `app/`, `spike/` (после переноса), `spike/*.sh`,
`scratch/`, `public/video_test.html`, `public/images/rig/`. `NOTEBOOKLM-SOURCE.md`
(untracked, не в репо) не трогается.

Обновляются ссылки: `api/transcribe.js` (`../lib/...`), `tools/dump-story.js`
(`../public/story.js`), `tools/prerender.py` (`OUT_DIR = ROOT/public/audio`), тесты
(`../public/...`, `../lib/...`), `docs/story-script.md`, `docs/status-report-2026-09-17.md`
(упоминания `app/public` → `public`, `spike/` → `lib/`), `IDEA.md` строка со статусом
(`app/public/session.js` → `public/session.js`). Старые статус-отчёты и спеки — история, не
правятся.

`.vercelignore`: `server`, `tools`, `tests`, `docs`, `.superpowers`, `.agents`, `.claude`,
`sd-local`, `.git`. `lib/` остаётся — его импортирует `api/transcribe.js`.

`.gitignore`: заменить `app/tmp/*` + `!app/tmp/.gitkeep` на `server/tmp/*` +
`!server/tmp/.gitkeep`; `spike/audio/`, `spike/tools/` убрать; остальное как есть.

## 2. Кроссплатформенный `server/server.js`

### `server/bins.js` (новый, ESM)

`resolveBins(env = process.env, opts) → { ffmpeg, whisper, whisperModel, piper, piperVoice }`,
каждое поле — абсолютный путь или `null`. Правила по порядку:

| поле | env | default | если не найден |
|---|---|---|---|
| ffmpeg | `FFMPEG_BIN` | `ffmpeg` из PATH; иначе бинарь `imageio-ffmpeg` из `tools/.venv` (glob `tools/.venv/lib/python*/site-packages/imageio_ffmpeg/binaries/ffmpeg-*`) | `null` — loudnorm пропускается, локальный Whisper и pitch-shift TTS недоступны |
| whisper | `WHISPER_BIN` | `whisper-cli` из PATH | `null` — только Groq STT |
| whisperModel | `WHISPER_MODEL` | `tools/models/ggml-small.bin` если существует | `null` — как выше |
| piper | `PIPER_BIN` | `tools/.venv/bin/piper` (Windows: `tools/.venv/Scripts/piper.exe`), иначе `piper` из PATH | `null` — `/api/speak` отвечает 503, клиент падает на `.wav` |
| piperVoice | `PIPER_VOICE_KK` | `tools/voices/kk_KZ-issai-high.onnx` | `null` — как выше |

Поиск в PATH — `Bun.which(name)`; для тестов `opts.which` и `opts.exists` подменяемы.
На старте сервер печатает таблицу «bin → path | not found» одной строкой на бинарь.

### Изменения в `server.js`

- Убрать `TOOLS`, `findFfmpegRel`, `FFMPEG_REL`, константы `PIPER_EXE`/`PIPER_VOICE_KK` с
  Windows-путями. Все spawn — с абсолютными путями бинарей из `bins`.
- Кириллица в argv на Windows: все временные файлы и так с ASCII-именами (UUID); чтобы
  путь к ним не содержал кириллический каталог проекта, spawn выполняется с `cwd = TMP`
  и относительными именами файлов (`${id}.wav`), а не с `cwd = spike/tools`. Абсолютные
  пути бинарей допустимы (они выбираются пользователем и обычно ASCII).
- `preprocessForSTT`: если `bins.ffmpeg === null` — вернуть исходный буфер без обработки
  (лог один раз при старте, не на каждый запрос).
- `transcribeLocal`: если нет `whisper` или `whisperModel` — бросить `Error("local whisper
  unavailable")`, чтобы `transcribe()` вернул исходную ошибку Groq наверх (сейчас так же).
- `speak`: если нет `piper`/`piperVoice` — `503 {error:"piper unavailable"}`; если нет
  ffmpeg — отдать «сырой» wav без pitch-shift (лог).
- Статика: `../public`, путь через `decodeURIComponent(url.pathname)`; запрет `..`
  (нормализация через `path.normalize` + проверка префикса).
- `PORT` из env, по умолчанию 3000.
- Всё остальное (Groq, blocklist, classify, промпты) — без изменений; импорты →
  `../lib/blocklist-core.js`, `../lib/stt-hints-core.js`.

### Проверка на этой машине

`bun server/server.js` стартует; `GET /` отдаёт `public/index.html`; `GET /audio/q_echo_balyq.wav`
отдаёт файл; `POST /api/speak` с текстом возвращает `audio/wav` (piper из `tools/.venv`,
ffmpeg из imageio-ffmpeg); `POST /api/transcribe` без `GROQ_API_KEY` и без whisper —
`500` с внятной ошибкой, не зависание.

## 3. README, CI, CSS, env

- `README.md` (ru, ≤120 строк): что это; структура; быстрый старт (`cp .env.example .env`,
  `bun server/server.js`, открыть `http://localhost:3000`); панель оператора; переменные
  окружения (таблица из §2); пререндер озвучки; тесты; деплой Vercel (zero-config,
  `GROQ_API_KEY` в настройках проекта); что проверять на реальном устройстве; ссылки на
  `docs/`.
- `.env.example`: `GROQ_API_KEY=`, `PORT=3000`, и пять переменных из §2 с комментариями.
- `.github/workflows/ci.yml`: на push/PR — `oven-sh/setup-bun@v2`, `bun test`, затем
  синтаксис ESM: `bun build --no-bundle server/server.js api/transcribe.js lib/*.js
  --outdir /tmp/ci-build` (парсинг без запуска).
- CSS: блоки `#sceneOverlay.scene-*`, `.brother-fox` (+keyframes), `#operatorPanel`,
  `.history*`, `.skill-state`, `#trackOverlay .track` переезжают из `public/index.html`
  в `public/design-system.css` (раздел «Scene & report»); в `index.html` остаётся только
  page-layout.

## 4. Тесты

- Существующие 64 — в `tests/`, пути обновлены, зелёные.
- `tests/bins.test.js`: `resolveBins` с подставными `which`/`exists`/env — env-override
  побеждает; PATH-фолбэк; `null` при отсутствии; Windows-вариант пути piper.
- `tests/static-path.test.js`: `safeStaticPath(root, urlPath)` (вынести в `server/static.js`):
  декодирование `%D0%B1…`, `/` → `index.html`, `..` → `null`.
- CI зелёный на первом пуше ветки после этапа.

## 5. Завершение

После финального ревью: `git checkout design-v2 && git merge --no-ff story-and-parent-report`,
`git push origin design-v2`. Vercel задеплоит новый `public/`. Ветку не удалять.

## Файлы

Новые: `server/bins.js`, `server/static.js`, `tests/bins.test.js`, `tests/static-path.test.js`,
`README.md`, `.github/workflows/ci.yml`, `package.json` (корень).
Перемещаются: `app/public/** → public/**`, `app/server.js → server/server.js`,
`app/tests/* → tests/*`, `spike/blocklist-core.js`, `spike/stt-hints-core.js` → `lib/`,
`spike/blocklist.js → lib/blocklist-cli.js`, `app/tmp/.gitkeep → server/tmp/.gitkeep`.
Меняются: `server/server.js`, `api/transcribe.js`, `tools/*`, тесты, `public/index.html`,
`public/design-system.css`, `.gitignore`, `.vercelignore`, `.env.example`, `docs/story-script.md`,
`docs/status-report-2026-09-17.md`, `IDEA.md` (одна строка).
Удаляются: старый `public/`, `app/`, `spike/`, `scratch/`, `public/video_test.html`,
`public/images/rig/`.
