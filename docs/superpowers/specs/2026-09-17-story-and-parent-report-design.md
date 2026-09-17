# Ертегім — сказка «Түлкі інісін іздейді» и реальный отчёт родителю

Дата: 2026-09-17. Статус: APPROVED (согласовано в чате).
Этап 1 из 3 послепитчевого плана: **сказка + родитель → фундамент → полировка**.

## Цель

Превратить демо из двух несвязанных мини-вопросов в настоящую сказку по механике из
`IDEA.md` (цель героя, страх героя, таймер, память) и заменить статичный мок-отчёт
родителю на отчёт, посчитанный из реальной сессии, с историей прошлых игр. Детский
экран очищается от операторских элементов.

Не входит: рефакторинг на ES-модули, кроссплатформенный `app/server.js` (кроме
скрипта пререндера), настоящий PIN, удаление дубликата `public/` — всё это этап
«фундамент». Работа ведётся только в `app/public/`; старая копия `public/` не трогается.

## 1. Сюжет и данные

### Граф состояний

```
intro ─────────────────────────► q_tracks [count]
q_tracks ─correct/reveal──────► tracks_ok ─► fork_intro ─► q_fork [choice]
q_fork ─river─────────────────► owl_meet ─► cave_arrive
q_fork ─forest────────────────► bear_meet ─► cave_arrive
cave_arrive ──────────────────► cave_fear ─► q_courage [empathy]
q_courage ─correct/reveal─────► cave_enter ─► q_echo [rhyme]
q_echo ─correct/reveal────────► found ─► thanks ─► parent_report
любой вопрос ─blocked─────────► BLOCKED (стоп, как сейчас)
```

Каждый вопрос имеет `reask`-узел (один переспрос) и `reveal`-узел (герой сам даёт
ответ и идёт дальше). Логика `reaskUsed`/`activeQuestionId` из `app.js` сохраняется.

### Формат узла (`app/public/story.js`)

```js
{
  kind: "narration" | "question" | "end",
  speaker: "Түлкі (лисёнок)",
  character: "fox" | "owl" | "bear",
  pose: "idle" | "talk" | "happy" | "confused" | "think",
  bg: "night" | "river" | "forest" | "cave" | "dawn",
  kk: "...", ru: "...",
  next: "id",                                  // narration
  // question:
  mode: "exact" | "open" | "branch",
  skill: "count" | "choice" | "empathy" | "rhyme",
  criterion: "...",                            // текст для LLM
  onCorrect, onReask, onReveal,                // exact/open
  onAnswer: { river: "owl_meet", forest: "bear_meet" }, // branch
  onReask, onReveal,                           // branch: reveal = случайная ветка
}
```

`HERO_FOR_STATE` из `characters.js` удаляется — `renderHero(id)` читает
`character/pose` из узла. `SCENE_BG` в `app.js` заменяется на таблицу
`bg → {image, overlayClass}`.

### Рандомизация за сессию

- `q_tracks`: число следов 2–5 (переиспользует механику `rerollBerries`, переименованную в
  `rerollTracks`; оверлей — «следы» вместо ягод).
- `q_echo`: имя братика выбирается из `OWL_WORDS`-подобного списка (`Балық`, `Мысық`),
  критерий — созвучное слово на «-ық/-ик», как сейчас у совёнка.

### Память героя (`localStorage["ertegim.memory"]`)

```js
{ runs: number, lastRoute: "river"|"forest"|null, lastPlayedAt: ISO }
```

- `runs === 0`: `intro` — обычное знакомство.
- `runs >= 1`: `intro` заменяется на `intro_again` («Помнишь, как мы искали братика?
  Он опять убежал…»), `thanks` — на `thanks_again`. Реализуется переключением стартового
  узла и `next` у `found`, а не мутацией текста, чтобы у каждого варианта был свой `.wav`.
- `runs` инкрементируется в `session.finish()` только при `completed === true`.
- Лимит длительности: если с `startedAt` прошло > 8 мин, следующий переход на
  narration-узел ведёт сразу в `found` (мягкий финал; `completed = true`).

### Тексты

Все реплики — казахский + русский подстрочник, как сейчас. Обновляется
`docs/story-script.md` (полный сценарий с id узлов и пометками «проверить с носителем»).

## 2. Классификация ответов

Сервер (`/api/classify`) и его промпт не меняются: на вход — `transcript`, `questionKk`,
`criterion`; на выход — `{label, reason}`. Режимы отличаются критерием и локальным фолбэком
(`localClassify` в `app.js`):

| mode | criterion (LLM) | локальный фолбэк | correct → | unclear/incorrect → |
|---|---|---|---|---|
| exact (count) | число N на kk/ru | fuzzy-match форм числа | onCorrect | reask → reveal |
| exact (rhyme) | созвучие с именем | суффикс `-ық/-ик` | onCorrect | reask → reveal |
| branch | «верни `reason` = `river` или `forest`» | ключевые слова: сол/оң/налево/направо/өзен/река/орман/лес | onAnswer[route] | reask → reveal (случайная ветка) |
| open (empathy) | «любая ободряющая/поддерживающая фраза по теме» | ≥1 слово длиной ≥3 | onCorrect | reask → reveal |

Для `branch` LLM-ответ парсится: если `label === "correct"` и `reason` содержит одну из
веток — берём её; иначе — как `unclear`. Локальный фолбэк для branch возвращает
`{label:"correct", route}`.

Блоклист (`spike/blocklist-core.js`) работает без изменений на каждом ответе.

## 3. Сессия, метрики, история

### `app/public/session.js` (новый, classic script, как остальные)

```js
const Session = {
  start(),                       // сбрасывает state, startedAt = now
  questionShown(nodeId, skill, attempt),
  answer({ nodeId, transcript, verdict, source, route }),
  setRoute(route),
  markBlocked(),
  finish({ completed }),          // endedAt, пишет memory + history
  current(),                      // сырое состояние
  summarize(session),             // чистая функция → summary
  history(),                      // массив summary из localStorage
};
```

Сырое состояние:

```js
{ startedAt, endedAt, route, blocked, completed,
  turns: [{ nodeId, skill, attempt, askedAt, answeredAt, transcript, verdict, source, route }] }
```

`summary` (то, что хранится и рендерится):

```js
{
  date: ISO, durationSec, route, completed, blocked,
  words: ["…"],                 // уникальные слова из транскриптов, длина ≥3, без блок-триггеров
  avgResponseSec,               // по первым попыткам с answeredAt
  firstTryCorrect, questionsTotal,
  skills: { count: "first"|"reask"|"reveal"|"skipped", choice: …, empathy: …, rhyme: … },
  moments: [{ atSec, text_kk }] // «жолды таңдады», «түлкіге батылдық берді», «інісін тапты» …
}
```

История: `localStorage["ertegim.sessions"]` — массив summary, новые в начало, максимум 30.
Транскрипты целиком не сохраняются — только `words`.

### Отчёт (`app/public/report.js`, новый)

`renderReport(summary, history)` заполняет существующую разметку `#reportPanel`:
чипы (слова / среднее время / точность), теги слов, таймлайн моментов, прогресс по
навыкам (4 строки: санау, жол таңдау, батылдық, ұйқас — медведь «жақында» убирается),
и новый блок «Өткен ойындар» — до 5 последних сессий (дата, точность, среднее время).
PIN-гейт остаётся косметическим.

## 4. Экраны

- `index.html` — детский экран: сцена, оверлей следов, герой, реплика (kk крупно, ru
  мелко), индикатор слушания (текущая mic-кнопка). Никаких `Далее`, `Верно`, `Переспросить`,
  `Advance`, лога, pipeline-чипов, загрузки файла.
- Всё операторское переезжает в `<aside id="operatorPanel" hidden>`: pipeline-чипы,
  transcript/verdict, три кнопки, загрузка файла, лог, reset. Показывается по клавише
  `` ` `` (Backquote) или при `?op=1` в URL. Обработчики в `app.js` не меняются.
- Стартовый оверлей «Бастау» остаётся (нужен для iOS-аудио и микрофона).

## 5. Озвучка и арт

- `tools/prerender.py` (новый, заменяет `spike/prerender.js`): читает `story.js` через
  регулярку/`node -e`, для каждого узла с `kk` синтезирует `app/public/audio/<id>.wav`
  через `piper-tts` (голос `kk_KZ-issai-high`, speaker 3), pitch-shift 1.4 через ffmpeg из
  `imageio-ffmpeg` (`asetrate=22050*1.4,aresample=22050,atempo=1/1.4`). Пропускает уже
  существующие файлы, если не передан `--force`. Зависимости — `tools/requirements.txt`.
- Голос модели скачивается в `tools/voices/` (gitignored), путь переопределяется
  `PIPER_VOICE_KK`.
- Старые `.wav` с устаревшими id удаляются.
- Фоны: `bg-fox.png` для night/river/forest/dawn, `bg-owl.jpg` для cave; поверх — CSS-оверлеи
  `.scene-night`, `.scene-cave`, `.scene-dawn` (градиенты/виньетка). Рассвет в `found` —
  плавный переход cave → dawn (transition на overlay).
- Медведь — SVG в `characters.js` в стиле совёнка (idle/talk/happy). Братик — `<img
  src="fox-happy.png">` уменьшенный, появляется в `found`.

## 6. Ошибки и деградация

Без изменений относительно текущего поведения: STT-fallback → ручные кнопки оператора
(в скрытой панели), classify-fallback → локальный, TTS-fallback → `.wav`, блокировка →
стоп. Новое: если `localStorage` недоступен (private mode) — память и история молча
отключаются, игра идёт как первая.

## 7. Тестирование

- `session.js` и `classify-local.js` — классические скрипты для браузера, но в конце
  каждого стоит `if (typeof module !== "undefined") module.exports = {...}`, чтобы
  `bun test` мог их `require`-нуть без сборки.
- `bun test` (`app/tests/`): `Session.summarize` (слова, среднее время, skills, moments),
  `localClassify` для всех четырёх режимов (вынести в `app/public/classify-local.js`, чтобы
  тестировать без DOM), логика памяти (первый/повторный запуск, лимит 8 мин).
- Ручной прогон в Chrome: обе ветки, переспрос + reveal на каждом вопросе, блокировка,
  повторный запуск с `intro_again`, отчёт с историей, операторская панель по `` ` ``.
- `api/transcribe.js` и серверные эндпоинты не меняются.

## Файлы

Новые: `app/public/session.js`, `app/public/report.js`, `app/public/classify-local.js`,
`app/tests/*.test.js`, `tools/prerender.py`, `tools/requirements.txt`, новые `.wav`.
Меняются: `app/public/story.js`, `app/public/app.js`, `app/public/characters.js`,
`app/public/index.html`, `docs/story-script.md`, `.gitignore`.
Удаляются: `spike/prerender.js`, устаревшие `app/public/audio/*.wav`.
