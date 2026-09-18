# Ертегім — запуск на Windows (ноутбук для сцены)

Цель: за 20 минут получить рабочий локальный сервер с микрофоном, Groq и живой озвучкой, и проверить пайплайн целиком.

## 0. Что нужно установить один раз

| Что | Откуда | Проверка |
|---|---|---|
| Git | https://git-scm.com | `git --version` |
| Bun | PowerShell: `powershell -c "irm bun.sh/install.ps1 \| iex"` | `bun --version` (нужен ≥ 1.3) |
| Node.js 22 | https://nodejs.org | `node --version` |
| Python 3.10+ | https://python.org (галочка «Add to PATH») | `python --version` |
| Chrome | — | — |

## 1. Код

```powershell
git clone https://github.com/MAL-Auyl/ertegim.git
cd ertegim
git checkout design-v2
```
Уже есть клон — тогда:
```powershell
git checkout design-v2
git pull
```

## 2. Ключ Groq

```powershell
copy .env.example .env
notepad .env
```
Впишите `GROQ_API_KEY=gsk_...` (ключ с https://console.groq.com). Остальные строки пока пустые. Файл `.env` в git не попадает.

## 3. Озвучка (Piper + ffmpeg)

```powershell
python -m venv tools\.venv
tools\.venv\Scripts\pip install -r tools\requirements.txt
```
Голос:
- если от старой установки есть `kk_KZ-issai-high.onnx` и `kk_KZ-issai-high.onnx.json` — положите оба в `tools\voices\`;
- если нет — скачает сам следующий шаг.

Проверка (заодно скачает голос ≈ 60 МБ):
```powershell
tools\.venv\Scripts\python tools\prerender.py --only intro --force
```
Ожидаемо: `rendered public\audio\intro.wav`. Если ошибка про `piper` — см. раздел «Если не работает».

## 4. Запуск сервера

```powershell
bun server\server.js
```
В первых строках — таблица `native helpers`:
```
ffmpeg        C:\...\tools\.venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-....exe
whisper       not found        ← нормально (локальный Whisper не нужен, есть Groq)
whisperModel  not found        ← нормально
piper         C:\...\tools\.venv\Scripts\piper.exe
piperVoice    C:\...\tools\voices\kk_KZ-issai-high.onnx
```
Если `piper` или `ffmpeg` — `not found`, но они у вас есть в другом месте, впишите в `.env`:
```
PIPER_BIN=C:\полный\путь\piper.exe
FFMPEG_BIN=C:\полный\путь\ffmpeg.exe
PIPER_VOICE_KK=C:\полный\путь\kk_KZ-issai-high.onnx
```
и перезапустите сервер. Без piper/ffmpeg приложение работает на пререндеренной озвучке — для демо это допустимо.

Сервер не закрывать; для остановки — `Ctrl+C`.

## 5. Проверка в Chrome

Откройте `http://localhost:3000/?op=1` (`?op=1` показывает панель оператора).

1. **Бастау** → разрешить микрофон. Слышна реплика лисёнка целиком (≈ 6 с), затем вопрос про следы.
2. После вопроса под героем появляется «Тыңдаймын…». Скажите ответ вслух («үш» / «три»).
3. В панели оператора смотрим чипы:
   - **MIC** → `получено`;
   - **STT** → зелёный, `... groq` — распознавание работает. Если красный `err` — ключ/сеть (см. ниже);
   - **SAFETY** → зелёный;
   - **LLM** → `correct`/`unclear` — классификатор работает. Если `локальный фолбэк` — Groq-чат недоступен, но игра идёт.
   - Через 2,5 с — авто-переход. Кнопки ✅ / 🔁 / ⏭ — ваш ручной override в любой момент.
4. В `#player` (панель) прослушайте свой клип: **начало фразы не обрезано**.
5. Пройдите до конца: развилка (скажите «солға» или «оңға»), пещера (скажите что-нибудь ободряющее), эхо (рифма на «-ық», например «қасық»), рассвет, «Сау бол!».
6. **Тағы ойнаймыз** — второй прогон должен начаться с «Сен қайта келдің!» (память).
7. **Ата-анаға** → любой PIN → отчёт: слова, время ответа, навыки, «Өткен ойындар».

Панель оператора на детском экране прячется клавишей `` ` `` (Ё) или кнопкой ⚙.

## 6. Что прислать после прогона

- таблицу `native helpers` из консоли сервера;
- скриншот панели с чипами после первого ответа;
- ошибки из Chrome (F12 → Console), если были;
- субъективно: обрезает ли начало фразы, слышен ли «динь» при верном ответе, не мешает ли эхо.

## Если не работает

| Симптом | Причина | Что делать |
|---|---|---|
| `bun: command not found` | Bun не в PATH | перезапустить PowerShell после установки |
| STT чип `err: GROQ_API_KEY not set` | нет ключа | проверить `.env`, перезапустить сервер |
| STT `err: groq http 401` | ключ неверный | новый ключ в console.groq.com |
| STT `err: groq http 429` | лимит запросов | подождать минуту |
| `piper failed` / `not found` | venv не установился | `tools\.venv\Scripts\pip install piper-tts` вручную; либо путь в `PIPER_BIN` |
| Реплики без озвучки, текст есть | нет `.wav` и нет piper | `tools\.venv\Scripts\python tools\prerender.py` (сгенерирует все 28) |
| Микрофон не запрашивается | открыт не `localhost` | использовать именно `http://localhost:3000`, не IP |
| Микрофон «слышит» лисёнка | колонки громко, микрофон рядом | наушники или гарнитура; VAD включается только после реплики, но громкие колонки всё равно мешают |
| Порт 3000 занят | другой процесс | `set PORT=3010` перед запуском, открыть `:3010` |

## На сцене

- Гарнитура/петличка, не встроенный микрофон.
- Тихая проверка за 10 минут до выхода: `Бастау` → один ответ → STT зелёный.
- Если Wi-Fi упал: игра идёт на пререндере + локальном классификаторе, оператор ведёт кнопками — репетируйте этот режим тоже.
