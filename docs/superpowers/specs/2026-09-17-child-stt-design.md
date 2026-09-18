# Ертегім — улучшение распознавания детской речи (этап 1b)

Дата: 2026-09-17. Статус: APPROVED в чате («вот это тоже сделай», пункты 1–3).
Следует за `2026-09-17-story-and-parent-report-design.md`; та же ветка `story-and-parent-report`.

## Цель

Поднять долю верно распознанных детских ответов без смены модели: (1) не терять
начало фразы и не рвать её на паузах, (2) подсказывать декодеру ровно тот словарь,
который ожидается на текущем вопросе, (3) судить ответ по звучанию, а не по буквам.

Не входит: параллельный kk/ru-прогон, смена модели на large-v3, сбор датасета —
это отдельные решения после замеров на реальных детях.

## 1. Клиент: pre-roll и пороги VAD (`app/public/app.js`)

- **Pre-roll.** Пока VAD «вооружён», `MediaRecorder` пишет непрерывно с
  `timeslice = VAD_CHUNK_MS = 250`. Чанки копятся в `vadChunks`; первый чанк —
  заголовок контейнера (WebM EBML / fMP4 init) и хранится всегда. При старте речи
  запоминается индекс `vadSpeechChunkIdx = vadChunks.length`. При завершении клип
  собирается чистой функцией `assembleClip(chunks, speechIdx, preRollChunks)` из
  нового файла `app/public/preroll.js`: `[chunks[0], ...chunks.slice(max(1, speechIdx -
  preRollChunks))]`, где `VAD_PREROLL_CHUNKS = 2` (≈500 мс). Чтобы буфер не рос
  бесконечно, пока ребёнок молчит, до старта речи `vadChunks` усекается до
  `1 + VAD_PREROLL_CHUNKS` последних (заголовок сохраняется). Реализация:
  `vadRecorder` стартует в `armVadForQuestion()` после `ensureMicStream()` (а не при
  первом громком кадре); `vadLoop` при старте речи только ставит индекс и
  `vadRecording = true`; `finishVadTurn()` → `stop()` → `onRecordingStop` собирает
  клип через `assembleClip`. Ручной путь `startRecording()` не меняется.
  Риск: WebM с выброшенными кластерами декодируется ffmpeg (сервер) и Groq с
  предупреждениями, но живая проверка возможна только на Windows/Vercel — отметить
  в статусе.
- **Пороги для детей:** `VAD_START_RMS 0.02 → 0.014`, `VAD_SILENCE_RMS 0.012 → 0.009`,
  `VAD_SILENCE_MS 1000 → 1400`, `VAD_MIN_SPEECH_MS 400 → 300`. `VAD_MAX_RECORD_MS`
  остаётся 8000. Все пороги — константы в одном блоке с комментарием «подобрано под
  детский голос, проверить на записях».
- Детский экран/оператор не меняются. `recordingStartedAt` = момент старта речи
  (`vadSpeechStartedAt`), а не старта рекордера — иначе pre-roll сдвинет метрику
  времени ответа.

## 2. Сервер: промпт STT по узлу (`spike/stt-hints-core.js`, `app/server.js`, `api/transcribe.js`)

- Подсказку строит сервер; клиент лишь сообщает, на каком вопросе он находится.
- Новый ESM-модуль `spike/stt-hints-core.js` (по образцу `spike/blocklist-core.js`: без
  DOM и Bun-API, импортируется и Bun-сервером, и Vercel Edge):
  `sttHintFor(nodeId, ctx) → string`:
  - `q_tracks`: числа 1–5 kk/ru + «із, санау»;
  - `q_fork`: «солға, оңға, өзен, орман, налево, направо, река, лес»;
  - `q_courage`: «қорықпа, мен сенімен біргемін, батыл, не бойся, я с тобой, смелый»;
  - `q_echo`: имя братика (`ctx.brotherName`) + «қасық, балық, мысық, ұйқас»;
  - любой другой/неизвестный id — текущий общий `GROQ_PROMPT` (переезжает сюда как
    `DEFAULT_HINT`, чтобы не дублировать строку в двух серверных файлах).
  Тесты: `app/tests/stt-hints.test.js` через `await import("../../spike/stt-hints-core.js")`.
- Клиент (`submitAudio` в `app.js`) добавляет в `FormData` поля `nodeId` (= `currentId`)
  и `brotherName` (= `brotherName.kkLower`).
- `app/server.js` и `api/transcribe.js`: читают `nodeId`/`brotherName` из формы
  (строки, необязательные), `prompt = sttHintFor(nodeId, { brotherName })`, добавляют
  `temperature: "0"` в форму Groq. Ничего больше в этих файлах не трогаем.

## 3. Фонетическая нормализация в локальном классификаторе (`app/public/classify-local.js`)

- `phonetic(word)`: нижний регистр → замены `қ→к, ғ→г, ң→н, һ→х, ә→а, ө→о, ү→у, ұ→у,
  і→и, ы→и, э→е, ё→е, й→и`, схлопывание двойных букв, удаление мягкого/твёрдого знака.
- `fuzzyIncludes` сравнивает `phonetic(w)` с `phonetic(target)`.
- Расширенный список форм чисел для `count`: `NUM_FORMS[n]` — kk/ru канон + детские
  искажения (`1: бір, бир, один, адин, раз`; `2: екі, еки, два, дфа`; `3: үш, уш, уч,
  три, тры, тли, тьли`; `4: төрт, торт, четыре, четыле, четыри`; `5: бес, пять, пять,
  пяць, пат`). Лежит в `classify-local.js`, а не в `story.js` (это словарь распознавания,
  не сюжет).
- Рифма: суффикс проверяется на `phonetic(w)` (`/(ик|ык)$/` после нормализации).
- Тесты: каждая искажённая форма → correct; `"солай"` по-прежнему не river.

## 4. Тестирование

- `bun test`: `classify-local` (фонетика, формы чисел), `stt-hints` (подсказка по
  каждому узлу, fallback на общий промпт).
- VAD pre-roll: без микрофона не проверить автоматически; ручная проверка на Windows
  (оператор слышит в `#player`, что первая согласная не отрезана). Отметить в статусе.
- `node --check` для `app/server.js` и `api/transcribe.js` — единственная проверка,
  доступная здесь.

## Файлы

Новые: `spike/stt-hints-core.js`, `app/tests/stt-hints.test.js`.
Меняются: `app/public/app.js` (VAD, submitAudio), `app/public/classify-local.js` +
тест, `app/server.js`, `api/transcribe.js`, `docs/status-report-2026-09-17.md`
(дописать раздел).
