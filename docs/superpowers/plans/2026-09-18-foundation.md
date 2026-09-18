# Этап «фундамент» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Один `public/`, который деплоит Vercel; локальный Bun-сервер, стартующий на Linux/macOS/Windows через env/PATH; README и CI.

**Architecture:** Перемещения через `git mv` с сохранением истории; серверная логика Groq/blocklist/classify не меняется — меняется только резолв бинарей (`server/bins.js`), путь к статике (`server/static.js`) и spawn-вызовы. Тесты переезжают в `tests/`, `package.json` — в корень.

**Tech Stack:** Bun 1.3, vanilla JS, Python venv (piper, imageio-ffmpeg), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-18-foundation-design.md`

## Global Constraints

- Ветка `story-and-parent-report`. Перемещения только `git mv`. Ничего не менять в логике Groq/blocklist/classify/story/session/report.
- Env-переменные ровно: `GROQ_API_KEY, PORT, FFMPEG_BIN, WHISPER_BIN, WHISPER_MODEL, PIPER_BIN, PIPER_VOICE_KK`.
- `bun test` из корня; после каждой задачи — все тесты зелёные (64 на старте).
- Коммиты завершать `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Не трогать: `IDEA.md` (кроме одной строки в Task 1), старые статус-отчёты/спеки, `NOTEBOOKLM-SOURCE.md` (untracked).

---

### Task 1: Перестройка структуры репо

**Files:**
- Move: `app/public/** → public/**`, `app/server.js → server/server.js`, `app/tests/* → tests/*`, `app/tmp/.gitkeep → server/tmp/.gitkeep`, `spike/blocklist-core.js → lib/blocklist-core.js`, `spike/stt-hints-core.js → lib/stt-hints-core.js`, `spike/blocklist.js → lib/blocklist-cli.js`
- Delete: старый `public/` (до перемещения), `spike/transcribe.sh`, `spike/transcribe-local.sh`, `app/package.json` (заменяется корневым), `scratch/`, `public/video_test.html`, `public/images/rig/`
- Create: `package.json` (корень)
- Modify: `api/transcribe.js`, `tools/dump-story.js`, `tools/prerender.py`, `tests/*.test.js`, `lib/blocklist-cli.js`, `server/server.js` (только импорты), `.gitignore`, `.vercelignore`, `docs/story-script.md`, `docs/status-report-2026-09-17.md`, `IDEA.md:52`

- [ ] **Step 1: Удалить старый корневой `public/` и переместить новый**

```bash
cd /home/technopark/ertegim
git rm -r -q public
git mv app/public public
mkdir -p server/tmp
git mv app/server.js server/server.js
git mv app/tmp/.gitkeep server/tmp/.gitkeep
git mv app/tests tests
mkdir -p lib && git mv spike/blocklist-core.js lib/blocklist-core.js && git mv spike/stt-hints-core.js lib/stt-hints-core.js && git mv spike/blocklist.js lib/blocklist-cli.js
git rm -q spike/transcribe.sh spike/transcribe-local.sh app/package.json
git rm -r -q public/images/rig && git rm -q public/video_test.html
rm -rf scratch app spike   # оставшиеся пустые каталоги / untracked мусор
ls  # ожидаем: api docs lib public server tests tools IDEA.md ...
```

- [ ] **Step 2: Корневой `package.json`**

```json
{
  "name": "ertegim",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "bun test",
    "start": "bun server/server.js",
    "prerender": "tools/.venv/bin/python tools/prerender.py"
  }
}
```

- [ ] **Step 3: Обновить пути**

- `api/transcribe.js`: `../spike/blocklist-core.js` → `../lib/blocklist-core.js`; `../spike/stt-hints-core.js` → `../lib/stt-hints-core.js`; в комментарии строки 11–13 заменить `../spike/blocklist-core.js` / `spike/blocklist.js` на `../lib/blocklist-core.js` / `lib/blocklist-cli.js`.
- `server/server.js`: `import { checkBlocklist } from "../spike/blocklist.js";` → `from "../lib/blocklist-core.js"`; `../spike/stt-hints-core.js` → `../lib/stt-hints-core.js`. (Остальное — Task 3.)
- `lib/blocklist-cli.js`: `./blocklist-core.js` остаётся; в usage-комментарии `bun spike/blocklist.js` → `bun lib/blocklist-cli.js`.
- `tools/dump-story.js`: `path.join(__dirname, "..", "app", "public", "story.js")` → `path.join(__dirname, "..", "public", "story.js")`.
- `tools/prerender.py`: docstring `app/public/audio` → `public/audio`; `OUT_DIR = ROOT / "public" / "audio"`.
- `tests/*.test.js`: `../public/…` остаётся верным (tests/ → корень → public/); `../../spike/stt-hints-core.js` → `../lib/stt-hints-core.js`. Проверить: `grep -rn "spike\|app/" tests/` → пусто.
- `public/app.js:118` комментарий `spike/prerender.js` → `tools/prerender.py`.
- `docs/story-script.md`: `app/public/story.js` → `public/story.js`; `spike/blocklist.js` → `lib/blocklist-core.js` (2 места).
- `docs/status-report-2026-09-17.md`: `app/public/` → `public/`, `spike/` → `lib/` (все вхождения).
- `IDEA.md:52`: `app/public/session.js` → `public/session.js`.

- [ ] **Step 4: `.gitignore` и `.vercelignore`**

`.gitignore` — заменить строки `app/tmp/*`, `!app/tmp/.gitkeep`, `spike/audio/`, `spike/tools/` на:
```
server/tmp/*
!server/tmp/.gitkeep
tools/models/
```
(`tools/voices/`, `tools/.venv/`, `tools/__pycache__/`, `.superpowers/` уже есть.)

`.vercelignore` — полностью:
```
server
tools
tests
docs
.superpowers
.agents
.claude
sd-local
.git
```

- [ ] **Step 5: Проверка**

```bash
cd /home/technopark/ertegim && bun test 2>&1 | tail -3        # 64 pass
node tools/dump-story.js | python3 -c "import json,sys;print(len(json.load(sys.stdin)))"   # 28
grep -rn "app/public\|spike/" api tools tests lib server public docs/story-script.md docs/status-report-2026-09-17.md README.md 2>/dev/null | grep -v "^docs/superpowers" ; echo "grep exit=$?"   # ничего, exit=1
git status --short | grep -v "^R\|^D\|^A\|^M" ; ls app spike scratch 2>&1 | head -3     # каталогов нет
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Restructure: single public/, server/, lib/, tests/ at repo root; drop stale copy and spikes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `server/bins.js` и `server/static.js` с тестами

**Files:**
- Create: `server/bins.js`, `server/static.js`
- Test: `tests/bins.test.js`, `tests/static-path.test.js`

**Interfaces:**
- `resolveBins(env, { which, exists, platform, root }) → { ffmpeg, whisper, whisperModel, piper, piperVoice }` (ESM export), `describeBins(bins) → string[]`.
- `safeStaticPath(root, urlPath) → string | null` (ESM export).

- [ ] **Step 1: Тесты**

`tests/bins.test.js`:
```js
const { test, expect } = require("bun:test");

const root = "/repo";
function mk(overrides = {}) {
  const found = overrides.found || {};
  const files = new Set(overrides.files || []);
  return {
    which: (name) => found[name] || null,
    exists: (p) => files.has(p),
    platform: overrides.platform || "linux",
    root,
  };
}

test("env override wins over PATH", async () => {
  const { resolveBins } = await import("../server/bins.js");
  const b = resolveBins({ FFMPEG_BIN: "/opt/ffmpeg" }, mk({ found: { ffmpeg: "/usr/bin/ffmpeg" } }));
  expect(b.ffmpeg).toBe("/opt/ffmpeg");
});

test("PATH fallback, then imageio-ffmpeg from venv, then null", async () => {
  const { resolveBins } = await import("../server/bins.js");
  expect(resolveBins({}, mk({ found: { ffmpeg: "/usr/bin/ffmpeg" } })).ffmpeg).toBe("/usr/bin/ffmpeg");
  const venvBin = "/repo/tools/.venv/lib/python3.10/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2";
  expect(resolveBins({}, { ...mk(), globVenvFfmpeg: () => venvBin }).ffmpeg).toBe(venvBin);
  expect(resolveBins({}, { ...mk(), globVenvFfmpeg: () => null }).ffmpeg).toBeNull();
});

test("piper: venv bin on linux, Scripts/piper.exe on win32, PATH otherwise", async () => {
  const { resolveBins } = await import("../server/bins.js");
  expect(resolveBins({}, mk({ files: ["/repo/tools/.venv/bin/piper"] })).piper).toBe("/repo/tools/.venv/bin/piper");
  expect(resolveBins({}, mk({ platform: "win32", files: ["/repo/tools/.venv/Scripts/piper.exe"] })).piper).toBe("/repo/tools/.venv/Scripts/piper.exe");
  expect(resolveBins({}, mk({ found: { piper: "/usr/local/bin/piper" } })).piper).toBe("/usr/local/bin/piper");
  expect(resolveBins({}, mk()).piper).toBeNull();
});

test("voice and whisper model default to tools/ paths only if they exist", async () => {
  const { resolveBins } = await import("../server/bins.js");
  const b = resolveBins({}, mk({ files: ["/repo/tools/voices/kk_KZ-issai-high.onnx", "/repo/tools/models/ggml-small.bin"] }));
  expect(b.piperVoice).toBe("/repo/tools/voices/kk_KZ-issai-high.onnx");
  expect(b.whisperModel).toBe("/repo/tools/models/ggml-small.bin");
  expect(resolveBins({}, mk()).piperVoice).toBeNull();
  expect(resolveBins({ WHISPER_MODEL: "/m.bin" }, mk()).whisperModel).toBe("/m.bin");
});

test("describeBins lists every field", async () => {
  const { resolveBins, describeBins } = await import("../server/bins.js");
  const lines = describeBins(resolveBins({}, mk()));
  expect(lines.length).toBe(5);
  expect(lines.every((l) => l.includes("not found"))).toBe(true);
});
```

`tests/static-path.test.js`:
```js
const { test, expect } = require("bun:test");

test("safeStaticPath", async () => {
  const { safeStaticPath } = await import("../server/static.js");
  const root = "/repo/public";
  expect(safeStaticPath(root, "/")).toBe("/repo/public/index.html");
  expect(safeStaticPath(root, "/library.html")).toBe("/repo/public/library.html");
  expect(safeStaticPath(root, "/audio/q_echo_%62alyq.wav")).toBe("/repo/public/audio/q_echo_balyq.wav");
  expect(safeStaticPath(root, "/images/%D1%82%D2%AF%D0%BB%D0%BA%D1%96.png")).toBe("/repo/public/images/түлкі.png");
  expect(safeStaticPath(root, "/../server/server.js")).toBeNull();
  expect(safeStaticPath(root, "/a/../../x")).toBeNull();
  expect(safeStaticPath(root, "/%zz")).toBeNull(); // bad percent-encoding → null, not throw
});
```

- [ ] **Step 2: Запустить — падают** (`bun test tests/bins.test.js tests/static-path.test.js`)

- [ ] **Step 3: `server/bins.js`**

```js
// Where the native helpers live. Order per binary: explicit env → PATH →
// the project's own tools/.venv (created for tools/prerender.py) → null.
// Nothing here is fatal: server.js degrades per binary (Groq-only STT,
// pre-rendered .wav instead of live Piper) and prints what it found.
import { join } from "node:path";
import { existsSync } from "node:fs";

const VOICE_DEFAULT = "tools/voices/kk_KZ-issai-high.onnx";
const WHISPER_MODEL_DEFAULT = "tools/models/ggml-small.bin";

function defaultGlobVenvFfmpeg(root) {
  // imageio-ffmpeg ships its binary as .../imageio_ffmpeg/binaries/ffmpeg-<platform>-v<ver>
  const patterns = [
    "tools/.venv/lib/python*/site-packages/imageio_ffmpeg/binaries/ffmpeg-*",
    "tools/.venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-*.exe",
  ];
  for (const p of patterns) {
    try {
      for (const f of new Bun.Glob(p).scanSync({ cwd: root })) return join(root, f);
    } catch {
      // root or venv missing — nothing to find
    }
  }
  return null;
}

function resolveBins(env = process.env, opts = {}) {
  const which = opts.which || ((n) => Bun.which(n));
  const exists = opts.exists || existsSync;
  const platform = opts.platform || process.platform;
  const root = opts.root || join(import.meta.dir, "..");
  const globVenvFfmpeg = opts.globVenvFfmpeg || (() => defaultGlobVenvFfmpeg(root));

  const ffmpeg = env.FFMPEG_BIN || which("ffmpeg") || globVenvFfmpeg() || null;
  const whisper = env.WHISPER_BIN || which("whisper-cli") || null;
  const modelDefault = join(root, WHISPER_MODEL_DEFAULT);
  const whisperModel = env.WHISPER_MODEL || (exists(modelDefault) ? modelDefault : null);

  const venvPiper = platform === "win32"
    ? join(root, "tools", ".venv", "Scripts", "piper.exe")
    : join(root, "tools", ".venv", "bin", "piper");
  const piper = env.PIPER_BIN || (exists(venvPiper) ? venvPiper : null) || which("piper") || null;
  const voiceDefault = join(root, VOICE_DEFAULT);
  const piperVoice = env.PIPER_VOICE_KK || (exists(voiceDefault) ? voiceDefault : null);

  return { ffmpeg, whisper, whisperModel, piper, piperVoice };
}

function describeBins(bins) {
  return Object.entries(bins).map(([k, v]) => `${k.padEnd(13)} ${v || "not found"}`);
}

export { resolveBins, describeBins };
```

`server/static.js`:
```js
// Map a request path to a file under public/. Decodes percent-encoding
// (asset names may be non-ASCII) and refuses anything that escapes root.
import { normalize, join, sep } from "node:path";

function safeStaticPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded === "/" || decoded === "") decoded = "/index.html";
  const full = normalize(join(root, decoded));
  const rootNorm = normalize(root + sep);
  if (!full.startsWith(rootNorm)) return null;
  return full;
}

export { safeStaticPath };
```

- [ ] **Step 4: Тесты зелёные** (`bun test` — 64 + 6)
- [ ] **Step 5: Commit** — `git add server/bins.js server/static.js tests/bins.test.js tests/static-path.test.js && git commit -m "server: resolve native binaries via env/PATH/venv; safe static path with percent-decoding\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 3: `server/server.js` — кроссплатформенный

**Files:**
- Modify: `server/server.js`

**Interfaces:**
- Consumes: `resolveBins`, `describeBins` (Task 2), `safeStaticPath` (Task 2).

- [ ] **Step 1: Заголовок и бинарники** — заменить строки 8–19 (`ROOT … FFMPEG_REL = findFfmpegRel();`) на:

```js
import { resolveBins, describeBins } from "./bins.js";
import { safeStaticPath } from "./static.js";

const ROOT = `${import.meta.dir}/`;
const TMP = `${ROOT}tmp`;
const PUBLIC = `${ROOT}../public`;
const PORT = Number(process.env.PORT) || 3000;

// Native helpers are optional: each feature below degrades on its own when
// its binary is missing (see server/bins.js). Windows note: whisper-cli /
// ffmpeg mangle non-ASCII argv, so every spawn runs with cwd=TMP and passes
// only the ASCII (UUID) file names relative to it — the project's own path
// (which may be Cyrillic) never appears in argv.
const bins = resolveBins();
console.log("native helpers:\n  " + describeBins(bins).join("\n  "));
```

- [ ] **Step 2: `preprocessForSTT`** — заменить целиком:

```js
async function preprocessForSTT(audioBuf, ext) {
  if (!bins.ffmpeg) return audioBuf; // no ffmpeg → send the raw clip as-is
  const id = crypto.randomUUID();
  const rawName = `${id}.${ext}`;
  const wavName = `${id}_norm.wav`;
  await Bun.write(`${TMP}/${rawName}`, audioBuf);
  try {
    const ff = Bun.spawnSync(
      [bins.ffmpeg, "-y", "-loglevel", "error", "-i", rawName,
       "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavName],
      { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
    );
    if (ff.exitCode !== 0) throw new Error(`ffmpeg loudnorm failed: ${new TextDecoder().decode(ff.stderr)}`);
    return await Bun.file(`${TMP}/${wavName}`).arrayBuffer();
  } finally {
    for (const n of [rawName, wavName]) await Bun.file(`${TMP}/${n}`).delete?.().catch(() => {});
  }
}
```
В `transcribeGroq`: `uploadName = "clip.wav"` ставить только если `bins.ffmpeg` (иначе остаётся `clip.${ext}`):
```js
  try {
    uploadBuf = await preprocessForSTT(audioBuf, ext);
    if (bins.ffmpeg) uploadName = "clip.wav";
  } catch (err) { … }
```

- [ ] **Step 3: `transcribeLocal`** — заменить целиком (комментарий над функцией укоротить до одной строки про cwd=TMP):

```js
async function transcribeLocal(audioBuf, ext) {
  if (!bins.ffmpeg || !bins.whisper || !bins.whisperModel) {
    throw new Error("local whisper unavailable (need ffmpeg + whisper-cli + WHISPER_MODEL)");
  }
  const id = crypto.randomUUID();
  const rawName = `${id}.${ext}`, wavName = `${id}.wav`, txtName = `${id}.txt`;
  await Bun.write(`${TMP}/${rawName}`, audioBuf);
  const t0 = performance.now();
  try {
    const ff = Bun.spawnSync(
      [bins.ffmpeg, "-y", "-loglevel", "error", "-i", rawName, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavName],
      { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
    );
    if (ff.exitCode !== 0) throw new Error(`ffmpeg failed: ${new TextDecoder().decode(ff.stderr)}`);
    const wh = Bun.spawnSync(
      [bins.whisper, "-m", bins.whisperModel, "-l", "kk", "-f", wavName, "-otxt", "-of", id, "-nt"],
      { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
    );
    if (wh.exitCode !== 0) throw new Error(`whisper-cli failed: ${new TextDecoder().decode(wh.stderr)}`);
    const transcript = (await Bun.file(`${TMP}/${txtName}`).text()).trim();
    return { transcript, ms: Math.round(performance.now() - t0) };
  } finally {
    for (const n of [rawName, wavName, txtName]) await Bun.file(`${TMP}/${n}`).delete?.().catch(() => {});
  }
}
```

- [ ] **Step 4: Piper** — удалить `PIPER_EXE`/`PIPER_VOICE_KK` и комментарий про Cyrillic path над ними (оставить комментарий про 6-speaker model / pitch). `speak` заменить:

```js
async function speak(text, speakerId = HERO_SPEAKER) {
  if (!bins.piper || !bins.piperVoice) {
    const err = new Error("piper unavailable (PIPER_BIN / PIPER_VOICE_KK)");
    err.status = 503;
    throw err;
  }
  const id = crypto.randomUUID();
  const rawName = `${id}_raw.wav`, outName = `${id}.wav`;
  const t0 = performance.now();
  try {
    const proc = Bun.spawnSync(
      [bins.piper, "-m", bins.piperVoice, "-f", rawName, "--speaker", String(speakerId)],
      { cwd: TMP, stdin: new TextEncoder().encode(text), timeout: SPAWN_TIMEOUT_MS },
    );
    if (proc.exitCode !== 0) throw new Error(`piper failed: ${new TextDecoder().decode(proc.stderr)}`);
    let outFile = rawName;
    if (bins.ffmpeg) {
      const pitch = Bun.spawnSync(
        [bins.ffmpeg, "-y", "-loglevel", "error", "-i", rawName,
         "-af", `asetrate=22050*${PITCH_FACTOR},aresample=22050,atempo=${1 / PITCH_FACTOR}`, outName],
        { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
      );
      if (pitch.exitCode !== 0) throw new Error(`ffmpeg pitch-shift failed: ${new TextDecoder().decode(pitch.stderr)}`);
      outFile = outName;
    }
    const bytes = await Bun.file(`${TMP}/${outFile}`).arrayBuffer();
    return { bytes, ms: Math.round(performance.now() - t0) };
  } finally {
    for (const n of [rawName, outName]) await Bun.file(`${TMP}/${n}`).delete?.().catch(() => {});
  }
}
```
В обработчике `/api/speak`: `return Response.json({ error: String(err) }, { status: err.status || 500 });`.

- [ ] **Step 5: Порт и статика** — `Bun.serve({ port: PORT, …`; блок статики:

```js
    const filePath = safeStaticPath(PUBLIC, url.pathname);
    if (filePath) {
      const file = Bun.file(filePath);
      if (await file.exists()) return new Response(file);
    }
    return new Response("Not found", { status: 404 });
```
и `console.log(\`Ертегім: http://localhost:${PORT}\`);`.

- [ ] **Step 6: Живой прогон на этой машине**

```bash
cd /home/technopark/ertegim && (bun server/server.js > /tmp/ertegim-server.log 2>&1 &) ; sleep 2
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/                     # 200 text/html
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/audio/q_echo_balyq.wav                # 200
curl -s --path-as-is -o /dev/null -w "%{http_code}\n" "http://localhost:3000/../server/server.js"    # 404
curl -s -X POST http://localhost:3000/api/speak -H 'content-type: application/json' -d '{"text":"Сәлем"}' -o /tmp/s.wav -w "%{http_code} %{content_type}\n"   # 200 audio/wav (piper из tools/.venv, ffmpeg из imageio-ffmpeg)
python3 -c "import wave;w=wave.open('/tmp/s.wav');print(w.getnframes()/w.getframerate(),'s')"      # ~1 s
curl -s -X POST http://localhost:3000/api/transcribe -F audio=@/tmp/s.wav -w " %{http_code}\n"       # 500 + JSON error (нет GROQ_API_KEY, нет whisper), не зависание
head -8 /tmp/ertegim-server.log     # таблица native helpers
pkill -f "bun server/server.js"
```
Если `/api/speak` даёт 503 — проверить `tools/.venv/bin/piper` и `tools/voices/*.onnx` (созданы этапом 1 в этом же репо) и починить резолв, а не пропускать проверку.

- [ ] **Step 7: Commit** — `git add server/server.js && git commit -m "server: cross-platform binaries via bins.js, graceful degradation, safe static paths, PORT\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 4: CSS в design-system, `.env.example`

**Files:**
- Modify: `public/index.html`, `public/design-system.css`, `.env.example`

- [ ] **Step 1: Перенести CSS** — из `<style>` в `public/index.html` вырезать и добавить в конец `public/design-system.css` под заголовком `/* ---- Scene, hero & report (moved from index.html) ---- */` блоки: `#trackOverlay` (+`.track`), `#sceneOverlay` и все `.scene-*`, `.brother-fox` + `@keyframes brotherIn`, `#operatorPanel` (+`.op-title`, `.show`), `.history`, `.history-row`, `.skill-state`. В `index.html` оставить только layout-правила. Строку в `@media (prefers-reduced-motion: reduce)` с `.brother-fox` оставить в index.html (она про page-level анимации) — либо перенести вместе с остальными, но не дублировать.
- [ ] **Step 2: `.env.example`**

```
# Groq API key — STT (whisper-large-v3-turbo) + answer classifier. Required for voice.
GROQ_API_KEY=
# Local server port
PORT=3000
# Native helpers for the local server (all optional; resolved env → PATH → tools/.venv).
# See README «Переменные окружения».
FFMPEG_BIN=
WHISPER_BIN=
WHISPER_MODEL=
PIPER_BIN=
PIPER_VOICE_KK=
```
- [ ] **Step 3: Проверка** — `grep -c "scene-night\|brother-fox\|operatorPanel" public/index.html public/design-system.css` (в index.html только в разметке/JS-независимых местах — селекторы CSS там отсутствуют: `grep -n "^\s*#sceneOverlay\|^\s*\.brother-fox\|^\s*#operatorPanel" public/index.html` → пусто); `bun test`; открыть страницу через `bun server/server.js` и `curl -s localhost:3000/design-system.css | grep -c scene-cave` → ≥1.
- [ ] **Step 4: Commit** — `git add public/index.html public/design-system.css .env.example && git commit -m "Move scene/report CSS into design-system.css; document env vars\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 5: README и CI

**Files:**
- Create: `README.md`, `.github/workflows/ci.yml`
- Modify: `docs/status-report-2026-09-17.md` (раздел «Фундамент — сделано», ≤8 строк)

- [ ] **Step 1: `README.md`** (ru, ≤120 строк) — разделы в этом порядке:
  1. `# Ертегім` — одна фраза (интерактивная голосовая сказка, ребёнок 3–7 отвечает голосом, kk с ru-подстрочником) + ссылка на `IDEA.md`.
  2. «Структура» — таблица каталогов из спека §1.
  3. «Быстрый старт» — `cp .env.example .env` (вписать `GROQ_API_KEY`), `bun server/server.js`, открыть `http://localhost:3000`; панель оператора: `` ` ``, ⚙, `?op=1`; без ключа/микрофона — что работает (fallback-озвучка, ручные кнопки).
  4. «Переменные окружения» — таблица из спека §2 (env → default → без него).
  5. «Озвучка (пререндер)» — `python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt && tools/.venv/bin/python tools/prerender.py` (скачает голос в `tools/voices/`); `--force`, `--only`.
  6. «Тесты» — `bun test`.
  7. «Деплой» — Vercel zero-config: `public/` + `api/`, переменная `GROQ_API_KEY` в проекте; live TTS на Vercel нет — только `.wav`.
  8. «Что проверять на реальном устройстве» — 4 пункта из статус-отчёта (STT/LLM живьём, pre-roll, VAD-пороги на детях, казахские реплики носителем).
  9. «Документы» — ссылки на `docs/story-script.md`, `docs/status-report-2026-09-17.md`, `docs/superpowers/specs/`.

- [ ] **Step 2: `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: ["**"]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.14"
      - run: bun test
      - name: Parse ESM entrypoints
        run: bun build --no-bundle server/server.js server/bins.js server/static.js api/transcribe.js lib/blocklist-core.js lib/stt-hints-core.js --outdir /tmp/ci-build
```
Локально проверить ту же команду `bun build …` — должна завершиться с кодом 0.

- [ ] **Step 3: Статус** — в `docs/status-report-2026-09-17.md` добавить раздел `## Фундамент — 2026-09-18`: единый `public/` (Vercel теперь деплоит новую сказку), `server/` кроссплатформенный (таблица bins на старте), README, CI, CSS в design-system; живой прогон на Linux: статика + `/api/speak` через Piper из venv — впервые проверено локально; всё ещё не проверено: Groq STT/LLM (нет ключа на этой машине), Windows-запуск сервера.
- [ ] **Step 4: Commit** — `git add README.md .github/workflows/ci.yml docs/status-report-2026-09-17.md && git commit -m "Add README and GitHub Actions CI; status note for the foundation stage\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`
