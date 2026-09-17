# Сказка «Түлкі інісін іздейді» + реальный отчёт родителю — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить два несвязанных мини-вопроса на сказку с целью/страхом/таймером/памятью героя и заменить мок-отчёт родителю на отчёт, посчитанный из реальной сессии, с историей прошлых игр; детский экран — без операторских кнопок.

**Architecture:** Существующая плоская state-machine `STORY` в `app/public/story.js` расширяется полями `mode/skill/bg/character/pose`; текстовые шаблоны и критерии переезжают из `app.js` в `story.js`. Логика сессии/метрик/памяти выносится в `session.js`, локальный классификатор — в `classify-local.js`, рендер отчёта — в `report.js`. Все файлы — классические браузерные `<script>` с `module.exports`-хвостом для `bun test`. Операторские элементы прячутся в `<aside>`; озвучка новых реплик пререндерится Piper'ом через `tools/prerender.py`.

**Tech Stack:** Vanilla JS (classic scripts, без сборки), Bun (`bun test`), Python 3.10 + `piper-tts` + `imageio-ffmpeg` для пререндера, Groq (STT/LLM — без изменений).

**Spec:** `docs/superpowers/specs/2026-09-17-story-and-parent-report-design.md`

## Global Constraints

- Работать только в `app/public/`; каталог `public/` (старая копия) не трогать.
- `app/server.js`, `api/transcribe.js`, `spike/blocklist-core.js` — не менять.
- Все реплики: казахский (`kk`) + русский подстрочник (`ru`); id узлов — латиница, snake_case.
- Голос Piper: `kk_KZ-issai-high`, speaker `3`, pitch-factor `1.4`.
- Память: `localStorage["ertegim.memory"]`; история: `localStorage["ertegim.sessions"]`, максимум 30 записей.
- Лимит сессии: 8 минут (`480000` мс) → мягкий финал через узел `found`.
- Операторская панель: клавиша `` ` `` (`event.code === "Backquote"`) или `?op=1`.
- Коммиты завершать строкой `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Тесты: `cd app && bun test` (Bun уже установлен: `~/.bun/bin/bun`).

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `app/public/story.js` (modify) | Данные истории: узлы, шаблоны динамических реплик (`trackLines`, `echoLines`), константы `NUM_KK/NUM_RU/BROTHER_NAMES`, `START_STATE` |
| `app/public/classify-local.js` (create) | Чистый локальный фолбэк-классификатор для 4 режимов |
| `app/public/session.js` (create) | Состояние сессии, `summarize`, память героя, история, лимит времени |
| `app/public/report.js` (create) | Рендер `#reportPanel` из summary + history |
| `app/public/characters.js` (modify) | SVG совёнка и медведя, арт лисёнка; `renderHero(node)` по узлу, без `HERO_FOR_STATE` |
| `app/public/index.html` (modify) | Детский экран + скрытая операторская панель + CSS сцен + разметка отчёта с id |
| `app/public/app.js` (modify) | Оркестрация: VAD/STT/TTS как было; новые режимы вопросов, сцены, хуки сессии, память, лимит, панель оператора |
| `app/tests/*.test.js` (create) | `bun test` для story-графа, classify-local, session |
| `app/package.json` (create) | Только чтобы `bun test` находил тесты и был скрипт `test` |
| `tools/prerender.py`, `tools/requirements.txt`, `tools/dump-story.js` (create) | Пререндер `.wav` |
| `docs/story-script.md` (modify) | Полный сценарий с id узлов |

---

### Task 1: Тестовая инфраструктура + `classify-local.js`

**Files:**
- Create: `app/package.json`
- Create: `app/public/classify-local.js`
- Test: `app/tests/classify-local.test.js`
- Modify: `app/public/app.js:710-768` (удалить старый `localClassify` и хелперы — делается в Task 6, здесь только создаём модуль)

**Interfaces:**
- Produces: `localClassify(node, transcript, ctx) → { label: "correct"|"unclear", reason: string, route?: "river"|"forest" }`
  - `node`: узел STORY с полями `mode` (`"exact"|"open"|"branch"`) и `skill` (`"count"|"choice"|"empathy"|"rhyme"`)
  - `ctx`: `{ trackCount: number, brotherName: string, numKk: string[], numRu: string[] }`
- Produces: `detectRoute(words) → "river"|"forest"|null`

- [ ] **Step 1: Создать `app/package.json`**

```json
{
  "name": "ertegim-app",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "bun test"
  }
}
```

- [ ] **Step 2: Написать падающий тест `app/tests/classify-local.test.js`**

```js
const { test, expect, describe } = require("bun:test");
const { localClassify, detectRoute } = require("../public/classify-local.js");

const NUM_KK = ["", "бір", "екі", "үш", "төрт", "бес"];
const NUM_RU = ["", "один", "два", "три", "четыре", "пять"];
const ctx = { trackCount: 3, brotherName: "балық", numKk: NUM_KK, numRu: NUM_RU };

describe("count (exact)", () => {
  const node = { mode: "exact", skill: "count" };
  test("accepts kk number", () => {
    expect(localClassify(node, "үш", ctx).label).toBe("correct");
  });
  test("accepts ru number with STT noise", () => {
    expect(localClassify(node, "тры штуки", ctx).label).toBe("correct");
  });
  test("accepts digit", () => {
    expect(localClassify(node, "3", ctx).label).toBe("correct");
  });
  test("rejects wrong number", () => {
    expect(localClassify(node, "бес", ctx).label).toBe("unclear");
  });
  test("empty → unclear", () => {
    expect(localClassify(node, "   ", ctx).label).toBe("unclear");
  });
});

describe("rhyme (exact)", () => {
  const node = { mode: "exact", skill: "rhyme" };
  test("accepts -ық suffix", () => {
    expect(localClassify(node, "қасық", ctx).label).toBe("correct");
  });
  test("accepts -ик suffix", () => {
    expect(localClassify(node, "столик", ctx).label).toBe("correct");
  });
  test("rejects no rhyme", () => {
    expect(localClassify(node, "үй", ctx).label).toBe("unclear");
  });
});

describe("branch (choice)", () => {
  const node = { mode: "branch", skill: "choice" };
  test("солға → river", () => {
    const r = localClassify(node, "солға барайық", ctx);
    expect(r.label).toBe("correct");
    expect(r.route).toBe("river");
  });
  test("в лес → forest", () => {
    expect(localClassify(node, "пойдём в лес", ctx).route).toBe("forest");
  });
  test("направо → forest", () => {
    expect(localClassify(node, "направо", ctx).route).toBe("forest");
  });
  test("өзен → river", () => {
    expect(localClassify(node, "өзенге", ctx).route).toBe("river");
  });
  test("no keyword → unclear, no route", () => {
    const r = localClassify(node, "не знаю", ctx);
    expect(r.label).toBe("unclear");
    expect(r.route).toBeUndefined();
  });
});

describe("open (empathy)", () => {
  const node = { mode: "open", skill: "empathy" };
  test("any real phrase is correct", () => {
    expect(localClassify(node, "қорықпа, мен қасыңдамын", ctx).label).toBe("correct");
  });
  test("single short noise word → unclear", () => {
    expect(localClassify(node, "ну", ctx).label).toBe("unclear");
  });
  test("empty → unclear", () => {
    expect(localClassify(node, "", ctx).label).toBe("unclear");
  });
});

describe("detectRoute", () => {
  test("river keywords", () => {
    expect(detectRoute(["налево"])).toBe("river");
    expect(detectRoute(["река"])).toBe("river");
    expect(detectRoute(["сол"])).toBe("river");
  });
  test("forest keywords", () => {
    expect(detectRoute(["оңға"])).toBe("forest");
    expect(detectRoute(["орманға"])).toBe("forest");
  });
  test("none", () => {
    expect(detectRoute(["привет"])).toBeNull();
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `cd app && bun test tests/classify-local.test.js`
Expected: FAIL — `Cannot find module '../public/classify-local.js'`

- [ ] **Step 4: Реализовать `app/public/classify-local.js`**

```js
// Local, network-free answer check — used only when /api/classify is
// unreachable, so the story still confirms itself instead of stalling.
// Same word-level fuzzy matching as spike/blocklist-core.js (Levenshtein
// tolerance scaled to word length). Pure functions, no DOM: loaded as a
// classic <script> in index.html and require()'d by bun test.

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tolerance(len) {
  if (len <= 6) return 1;
  return Math.max(2, Math.floor(len * 0.3));
}

function wordsOf(transcript) {
  return String(transcript || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'«»]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function fuzzyIncludes(words, target) {
  const t = target.toLowerCase();
  return words.some((w) => levenshtein(w, t) <= tolerance(t.length));
}

// Kazakh + Russian keywords for the fork question. Matched as prefixes so
// case endings (солға, өзенге, орманға, реку, лесу) don't matter.
const ROUTE_KEYWORDS = {
  river: ["сол", "өзен", "налев", "лев", "рек", "реч"],
  forest: ["оң", "орман", "направ", "прав", "лес"],
};

function detectRoute(words) {
  for (const [route, keys] of Object.entries(ROUTE_KEYWORDS)) {
    if (words.some((w) => keys.some((k) => w.startsWith(k)))) return route;
  }
  return null;
}

function localClassify(node, transcript, ctx) {
  const words = wordsOf(transcript);
  if (words.length === 0) return { label: "unclear", reason: "пусто (локально)" };

  if (node.mode === "branch") {
    const route = detectRoute(words);
    return route
      ? { label: "correct", reason: `маршрут: ${route} (локально)`, route }
      : { label: "unclear", reason: "направление не распознано (локально)" };
  }

  if (node.mode === "open") {
    const meaningful = words.filter((w) => w.length >= 3);
    return meaningful.length >= 1
      ? { label: "correct", reason: "ребёнок заговорил (локально)" }
      : { label: "unclear", reason: "слишком коротко (локально)" };
  }

  if (node.skill === "count") {
    const n = ctx.trackCount;
    const accepted = [ctx.numKk[n], ctx.numRu[n], String(n)];
    const hit = accepted.some((form) => fuzzyIncludes(words, form));
    return hit
      ? { label: "correct", reason: "число совпало (локально)" }
      : { label: "unclear", reason: "число не совпало (локально)" };
  }

  if (node.skill === "rhyme") {
    const rhymes = words.some((w) => /(ық|ик)$/.test(w));
    return rhymes
      ? { label: "correct", reason: "рифма «-ық/-ик» (локально)" }
      : { label: "unclear", reason: "рифма не найдена (локально)" };
  }

  return { label: "unclear", reason: "неизвестный режим (локально)" };
}

if (typeof module !== "undefined") {
  module.exports = { localClassify, detectRoute, wordsOf, levenshtein };
}
```

- [ ] **Step 5: Запустить тесты — зелёные**

Run: `cd app && bun test tests/classify-local.test.js`
Expected: все PASS

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/public/classify-local.js app/tests/classify-local.test.js
git commit -m "Extract local answer classifier into classify-local.js with branch/open modes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `session.js` — сессия, summary, память, история

**Files:**
- Create: `app/public/session.js`
- Test: `app/tests/session.test.js`

**Interfaces:**
- Produces глобальный объект `Session`:
  - `Session.start(now = Date.now())`
  - `Session.questionShown(nodeId, skill, attempt, now)`
  - `Session.answer({ nodeId, transcript, verdict, source, route, answeredAt })` — `verdict` ∈ `"correct"|"incorrect"|"unclear"|"reveal"`
  - `Session.setRoute(route)`
  - `Session.markBlocked()`
  - `Session.moment(textKk, now)`
  - `Session.overLimit(now) → boolean` (порог `SESSION_LIMIT_MS = 480000`)
  - `Session.finish({ completed }, now) → summary` (пишет память и историю)
  - `Session.current() → raw`
  - `Session.summarize(raw) → summary` (чистая)
  - `Session.memory() → { runs, lastRoute, lastPlayedAt }`
  - `Session.history() → summary[]`
  - `Session._storage` — подменяемое хранилище (`{getItem,setItem}`) для тестов

- [ ] **Step 1: Написать падающий тест `app/tests/session.test.js`**

```js
const { test, expect, describe, beforeEach } = require("bun:test");
const { Session, SESSION_LIMIT_MS } = require("../public/session.js");

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

beforeEach(() => {
  Session._storage = memStorage();
  Session.start(1000);
});

describe("summarize", () => {
  test("counts words, response time, first-try accuracy, skills, moments", () => {
    Session.questionShown("q_tracks", "count", 1, 1000);
    Session.answer({ nodeId: "q_tracks", transcript: "үш із", verdict: "correct", source: "ai", answeredAt: 3000 });
    Session.questionShown("q_fork", "choice", 1, 5000);
    Session.answer({ nodeId: "q_fork", transcript: "солға", verdict: "correct", source: "ai", route: "river", answeredAt: 6000 });
    Session.setRoute("river");
    Session.moment("жолды таңдады: өзен", 6000);
    Session.questionShown("q_courage", "empathy", 1, 9000);
    Session.answer({ nodeId: "q_courage", transcript: "ну", verdict: "unclear", source: "ai", answeredAt: 10000 });
    Session.questionShown("q_courage", "empathy", 2, 12000);
    Session.answer({ nodeId: "q_courage", transcript: "қорықпа мен қасыңдамын", verdict: "correct", source: "ai", answeredAt: 13000 });
    Session.questionShown("q_echo", "rhyme", 1, 15000);
    Session.answer({ nodeId: "q_echo", transcript: "үй", verdict: "unclear", source: "ai", answeredAt: 16000 });
    Session.questionShown("q_echo", "rhyme", 2, 18000);
    Session.answer({ nodeId: "q_echo", transcript: "жоқ", verdict: "reveal", source: "ai", answeredAt: 19000 });

    const s = Session.summarize(Session.current());
    // words shorter than 3 letters ("үш", "ну", "үй") are dropped as noise
    expect(s.words).toEqual(["солға", "қорықпа", "мен", "қасыңдамын", "жоқ"]);
    expect(s.avgResponseSec).toBeCloseTo((2 + 1 + 1 + 1) / 4, 5); // first attempts only
    expect(s.firstTryCorrect).toBe(2);
    expect(s.questionsTotal).toBe(4);
    expect(s.skills).toEqual({ count: "first", choice: "first", empathy: "reask", rhyme: "reveal" });
    expect(s.route).toBe("river");
    expect(s.moments).toEqual([{ atSec: 5, text_kk: "жолды таңдады: өзен" }]);
  });

  test("unanswered skill is 'skipped'", () => {
    const s = Session.summarize(Session.current());
    expect(s.skills.count).toBe("skipped");
    expect(s.avgResponseSec).toBeNull();
  });
});

describe("memory + history", () => {
  test("first run: runs=0", () => {
    expect(Session.memory()).toEqual({ runs: 0, lastRoute: null, lastPlayedAt: null });
  });
  test("finish completed increments runs and stores route", () => {
    Session.setRoute("forest");
    Session.finish({ completed: true }, 20000);
    expect(Session.memory().runs).toBe(1);
    expect(Session.memory().lastRoute).toBe("forest");
    expect(Session.history().length).toBe(1);
    expect(Session.history()[0].completed).toBe(true);
  });
  test("finish not completed does not increment runs but stores history", () => {
    Session.markBlocked();
    Session.finish({ completed: false }, 20000);
    expect(Session.memory().runs).toBe(0);
    expect(Session.history()[0].blocked).toBe(true);
  });
  test("history capped at 30, newest first", () => {
    for (let i = 0; i < 35; i++) {
      Session.start(i * 1000);
      Session.finish({ completed: true }, i * 1000 + 500);
    }
    const h = Session.history();
    expect(h.length).toBe(30);
    expect(new Date(h[0].date).getTime()).toBe(34000 + 500);
  });
  test("storage unavailable → memory silently empty", () => {
    Session._storage = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(Session.memory().runs).toBe(0);
    expect(() => Session.finish({ completed: true }, 5000)).not.toThrow();
  });
});

describe("overLimit", () => {
  test("false before 8 min, true after", () => {
    expect(Session.overLimit(1000 + SESSION_LIMIT_MS - 1)).toBe(false);
    expect(Session.overLimit(1000 + SESSION_LIMIT_MS + 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd app && bun test tests/session.test.js`
Expected: FAIL — `Cannot find module '../public/session.js'`

- [ ] **Step 3: Реализовать `app/public/session.js`**

```js
// Per-game session state, the parent-report metrics derived from it, the
// hero's cross-session "memory" and the report history. Everything the
// report shows is computed here from what actually happened — nothing is
// hardcoded in the HTML any more.
//
// Privacy: full transcripts live only in the in-memory `raw` object for the
// duration of the game. What gets persisted is the summary (word tags,
// timings, verdict per skill) — never audio, never whole sentences.

const SESSION_LIMIT_MS = 8 * 60 * 1000;
const MEMORY_KEY = "ertegim.memory";
const HISTORY_KEY = "ertegim.sessions";
const HISTORY_MAX = 30;
const SKILLS = ["count", "choice", "empathy", "rhyme"];

let raw = null;

function emptyRaw(now) {
  return { startedAt: now, endedAt: null, route: null, blocked: false, completed: false, turns: [], moments: [] };
}

function safeStorage() {
  try {
    return Session._storage || (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
}

function readJson(key, fallback) {
  try {
    const st = safeStorage();
    if (!st) return fallback;
    const v = st.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    const st = safeStorage();
    if (st) st.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota — memory & history just stay off
  }
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'«»]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function summarize(r) {
  const words = [];
  for (const t of r.turns) {
    for (const w of tokenize(t.transcript)) if (!words.includes(w)) words.push(w);
  }

  const firstAttempts = r.turns.filter((t) => t.attempt === 1 && t.answeredAt != null);
  const avgResponseSec = firstAttempts.length
    ? firstAttempts.reduce((acc, t) => acc + (t.answeredAt - t.askedAt) / 1000, 0) / firstAttempts.length
    : null;

  const skills = {};
  for (const skill of SKILLS) {
    const turns = r.turns.filter((t) => t.skill === skill);
    if (turns.length === 0) { skills[skill] = "skipped"; continue; }
    const first = turns.find((t) => t.attempt === 1);
    if (first && first.verdict === "correct") { skills[skill] = "first"; continue; }
    skills[skill] = turns.some((t) => t.verdict === "reveal") ? "reveal" : "reask";
  }

  const askedSkills = SKILLS.filter((s) => skills[s] !== "skipped");
  const firstTryCorrect = askedSkills.filter((s) => skills[s] === "first").length;

  const end = r.endedAt ?? r.startedAt;
  return {
    date: new Date(end).toISOString(),
    durationSec: Math.round((end - r.startedAt) / 1000),
    route: r.route,
    completed: r.completed,
    blocked: r.blocked,
    words,
    avgResponseSec,
    firstTryCorrect,
    questionsTotal: askedSkills.length,
    skills,
    moments: r.moments.map((m) => ({ atSec: Math.round((m.at - r.startedAt) / 1000), text_kk: m.text_kk })),
  };
}

const Session = {
  _storage: null,

  start(now = Date.now()) {
    raw = emptyRaw(now);
  },

  current() {
    if (!raw) raw = emptyRaw(Date.now());
    return raw;
  },

  questionShown(nodeId, skill, attempt, now = Date.now()) {
    this.current().turns.push({ nodeId, skill, attempt, askedAt: now, answeredAt: null, transcript: "", verdict: null, source: null, route: null });
  },

  answer({ nodeId, transcript, verdict, source, route, answeredAt = Date.now() }) {
    const turns = this.current().turns;
    // The open turn for this node is the last one without a verdict.
    let t = null;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].nodeId === nodeId && turns[i].verdict === null) { t = turns[i]; break; }
    }
    if (!t) return;
    t.transcript = transcript || "";
    t.verdict = verdict;
    t.source = source || null;
    t.route = route || null;
    t.answeredAt = answeredAt;
  },

  setRoute(route) { this.current().route = route; },
  markBlocked() { this.current().blocked = true; },
  moment(text_kk, now = Date.now()) { this.current().moments.push({ at: now, text_kk }); },

  overLimit(now = Date.now()) {
    return now - this.current().startedAt > SESSION_LIMIT_MS;
  },

  summarize,

  memory() {
    const m = readJson(MEMORY_KEY, null);
    return m && typeof m.runs === "number" ? m : { runs: 0, lastRoute: null, lastPlayedAt: null };
  },

  history() {
    const h = readJson(HISTORY_KEY, []);
    return Array.isArray(h) ? h : [];
  },

  finish({ completed }, now = Date.now()) {
    const r = this.current();
    r.endedAt = now;
    r.completed = Boolean(completed);
    const summary = summarize(r);

    if (r.completed) {
      const m = this.memory();
      writeJson(MEMORY_KEY, { runs: m.runs + 1, lastRoute: r.route, lastPlayedAt: summary.date });
    }
    const history = [summary, ...this.history()].slice(0, HISTORY_MAX);
    writeJson(HISTORY_KEY, history);
    return summary;
  },
};

if (typeof module !== "undefined") {
  module.exports = { Session, SESSION_LIMIT_MS };
}
```

- [ ] **Step 4: Запустить тесты — зелёные**

Run: `cd app && bun test tests/session.test.js`
Expected: все PASS

- [ ] **Step 5: Commit**

```bash
git add app/public/session.js app/tests/session.test.js
git commit -m "Add session.js: per-game metrics, hero memory, report history

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Новая история в `story.js` + тест целостности графа + сценарий

**Files:**
- Modify: `app/public/story.js` (полная замена содержимого)
- Modify: `docs/story-script.md` (полная замена)
- Test: `app/tests/story.test.js`

**Interfaces:**
- Produces глобалы: `STORY`, `START_STATE` (= `"intro"`), `START_STATE_AGAIN` (= `"intro_again"`), `NUM_KK`, `NUM_RU`, `BROTHER_NAMES`, `trackLines(n) → { revealKk, revealRu, criterion }`, `echoLines(name) → { kk, ru, criterion }`, `FINAL_IDS` (Set: `found`, `thanks`, `thanks_again`, `parent_report`).
- Узел: см. спек §1. Дополнительно `showBrother: true` на `found`/`thanks`/`thanks_again`.

- [ ] **Step 1: Написать тест `app/tests/story.test.js`**

```js
const { test, expect } = require("bun:test");
const { STORY, START_STATE, START_STATE_AGAIN, trackLines, echoLines, BROTHER_NAMES, FINAL_IDS } = require("../public/story.js");

const ids = Object.keys(STORY);
const refs = (n) => [n.next, n.onCorrect, n.onReask, n.onReveal, ...(n.onAnswer ? Object.values(n.onAnswer) : [])].filter(Boolean);

test("every referenced node exists", () => {
  for (const id of ids) for (const r of refs(STORY[id])) expect(ids).toContain(r);
});

test("start states exist and are narration", () => {
  expect(STORY[START_STATE].kind).toBe("narration");
  expect(STORY[START_STATE_AGAIN].kind).toBe("narration");
});

test("every node has character, pose, bg, speaker", () => {
  for (const id of ids) {
    const n = STORY[id];
    if (n.kind === "end") continue;
    expect(["fox", "owl", "bear"]).toContain(n.character);
    expect(["idle", "talk", "happy", "confused", "think"]).toContain(n.pose);
    expect(["night", "river", "forest", "cave", "dawn"]).toContain(n.bg);
    expect(typeof n.speaker).toBe("string");
    expect(n.kk.length).toBeGreaterThan(0);
    expect(n.ru.length).toBeGreaterThan(0);
  }
});

test("questions have mode/skill/criterion and reask+reveal; exact/open have onCorrect, branch has onAnswer", () => {
  const qs = ids.filter((id) => STORY[id].kind === "question");
  expect(qs.sort()).toEqual(["q_courage", "q_echo", "q_fork", "q_tracks"]);
  for (const id of qs) {
    const n = STORY[id];
    expect(["exact", "open", "branch"]).toContain(n.mode);
    expect(["count", "choice", "empathy", "rhyme"]).toContain(n.skill);
    expect(n.criterion.length).toBeGreaterThan(10);
    expect(n.onReask).toBeDefined();
    expect(n.onReveal).toBeDefined();
    if (n.mode === "branch") expect(Object.keys(n.onAnswer).sort()).toEqual(["forest", "river"]);
    else expect(n.onCorrect).toBeDefined();
  }
});

test("reask nodes loop back to their question", () => {
  expect(STORY.tracks_reask.next).toBe("q_tracks");
  expect(STORY.fork_reask.next).toBe("q_fork");
  expect(STORY.courage_reask.next).toBe("q_courage");
  expect(STORY.echo_reask.next).toBe("q_echo");
});

test("both routes reach found → thanks → parent_report", () => {
  function walk(id, seen = new Set()) {
    if (id === "parent_report") return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return refs(STORY[id]).some((r) => walk(r, seen));
  }
  expect(walk("owl_meet")).toBe(true);
  expect(walk("bear_meet")).toBe(true);
  expect(STORY.found.next).toBe("thanks");
  expect(STORY.thanks.next).toBe("parent_report");
  expect(STORY.thanks_again.next).toBe("parent_report");
  expect([...FINAL_IDS].sort()).toEqual(["found", "parent_report", "thanks", "thanks_again"]);
});

test("trackLines builds count text and criterion", () => {
  const t = trackLines(4);
  expect(t.revealKk).toContain("бір, екі, үш, төрт");
  expect(t.revealKk).toContain("Төрт із");
  expect(t.revealRu).toContain("Четыре следа");
  expect(t.criterion).toContain("(4)");
});

test("echoLines uses brother name", () => {
  for (const b of BROTHER_NAMES) {
    const e = echoLines(b);
    expect(e.kk).toContain(b.kk);
    expect(e.ru).toContain(b.kkLower);
    expect(e.criterion).toContain(b.kkLower);
  }
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd app && bun test tests/story.test.js`
Expected: FAIL (старый STORY: нет `intro`, `q_tracks` и т.д.)

- [ ] **Step 3: Заменить содержимое `app/public/story.js`**

```js
// Story state machine data — «Түлкі інісін іздейді» (the fox cub looks for
// his little brother). Mirrors docs/story-script.md; node ids there are the
// keys here.
//
// Node kinds:
//   narration — hero speaks, auto-advances to `next` after the line.
//   question  — hero speaks, then the child answers by voice.
//     mode "exact"  : one right answer (count / rhyme)     → onCorrect
//     mode "open"   : any on-topic speech counts (empathy) → onCorrect
//     mode "branch" : the answer picks the route           → onAnswer[route]
//     every question has onReask (one re-ask) and onReveal (hero answers
//     himself after the second miss and moves on).
//   end       — parent report.
// Every node also carries character/pose (who is on stage, how) and bg
// (which scene look), so characters.js/app.js never need a second table.

const NUM_KK = ["", "бір", "екі", "үш", "төрт", "бес"];
const NUM_RU = ["", "один", "два", "три", "четыре", "пять"];

function ruTrackWord(n) {
  if (n === 1) return "след";
  if (n >= 2 && n <= 4) return "следа";
  return "следов";
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Randomised per session (app.js rerollTracks): the reveal line and the LLM
// criterion for q_tracks depend on the rolled count.
function trackLines(n) {
  const kk = [], ru = [];
  for (let i = 1; i <= n; i++) { kk.push(NUM_KK[i]); ru.push(NUM_RU[i]); }
  return {
    revealKk: `Ештеңе етпейді! Бірге санайық: ${kk.join(", ")}! ${cap(NUM_KK[n])} із екен!`,
    revealRu: `Не страшно! Давай посчитаем вместе: ${ru.join(", ")}! ${cap(NUM_RU[n])} ${ruTrackWord(n)}!`,
    criterion:
      `Правильный ответ — число ${NUM_RU[n]} (${n}). Засчитывай верным любое произношение ` +
      `этого числа на казахском («${NUM_KK[n]}») или русском («${NUM_RU[n]}», «${n}»). ` +
      `Другое число, молчание или посторонний ответ — unclear.`,
  };
}

// Both real Kazakh words ending in -ық, same rhyme family as the reveal
// example «қасық», so echo_reveal never needs to change.
const BROTHER_NAMES = [
  { kk: "Балық", kkLower: "балық", ru: "Балык (рыбка)" },
  { kk: "Мысық", kkLower: "мысық", ru: "Мысык (котик)" },
];

function echoLines(b) {
  return {
    kk: `Үңгірде жаңғырық бар. Інімнің аты — ${b.kk}. Осыған ұйқас сөз айтшы, ол бізді естісін!`,
    ru: `В пещере эхо. Братика зовут ${b.kkLower}. Скажи похожее по звучанию слово, чтобы он нас услышал!`,
    criterion:
      `Правильный ответ — любое существующее казахское или русское слово, фонетически похожее на ` +
      `«${b.kkLower}» (например, оканчивается на «-ық»/«-ик», как «қасық»). Любая настоящая рифма/созвучие ` +
      `засчитывается верной. Слово без созвучия или посторонний ответ — unclear.`,
  };
}

const FOX = "Түлкі (лисёнок)";
const OWL = "Үкі (совёнок)";
const BEAR = "Аю (медведь)";

const STORY = {
  // ---- пролог -----------------------------------------------------------
  intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Сәлем! Мен — түлкі. Кішкентай інім жоғалып кетті... Таң атқанша оны тауып алуымыз керек. Маған көмектесесің бе?",
    ru: "Привет! Я лисёнок. Мой младший братик потерялся… Надо найти его до рассвета. Поможешь мне?",
    next: "q_tracks",
  },
  intro_again: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Сен қайта келдің! Есіңде ме, інімді бірге іздегенбіз? Ол тағы да қашып кетті... Маған тағы көмектесесің бе?",
    ru: "Ты вернулся! Помнишь, как мы искали братика? Он опять убежал… Поможешь мне снова?",
    next: "q_tracks",
  },

  // ---- следы: счёт --------------------------------------------------------
  q_tracks: {
    kind: "question", mode: "exact", skill: "count",
    speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Қара, жолда іздер бар! Неше із бар? Санап көрші!",
    ru: "Смотри, на тропинке следы! Сколько следов? Посчитай!",
    criterion: trackLines(3).criterion, // overwritten per session by rerollTracks()
    onCorrect: "tracks_ok", onReask: "tracks_reask", onReveal: "tracks_reveal",
  },
  tracks_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "night",
    kk: "Тағы бір рет қарайықшы. Іздерді бірінен соң бірін санап көр.",
    ru: "Давай посмотрим ещё раз. Посчитай следы по одному.",
    next: "q_tracks",
  },
  tracks_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "night",
    kk: trackLines(3).revealKk, ru: trackLines(3).revealRu, // overwritten per session
    next: "fork_intro",
  },
  tracks_ok: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "night",
    kk: "Дұрыс! Бұл інімнің іздері! Кеттік!",
    ru: "Правильно! Это следы моего братика! Идём!",
    next: "fork_intro",
  },

  // ---- развилка: выбор пути -----------------------------------------------
  fork_intro: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Міне, жол екіге бөлінеді. Сол жақта — өзен, оң жақта — орман.",
    ru: "Вот дорога раздваивается. Слева — река, справа — лес.",
    next: "q_fork",
  },
  q_fork: {
    kind: "question", mode: "branch", skill: "choice",
    speaker: FOX, character: "fox", pose: "talk", bg: "night",
    kk: "Қайда барамыз: солға, өзенге ме, әлде оңға, орманға ма?",
    ru: "Куда пойдём: налево к реке или направо в лес?",
    criterion:
      "Ребёнок выбирает дорогу. Если он выбрал реку/налево (өзен, солға, налево, река) — верни " +
      'label "correct" и reason ровно "river". Если лес/направо (орман, оңға, направо, лес) — ' +
      'label "correct" и reason ровно "forest". Если направление не понятно — "unclear".',
    onAnswer: { river: "owl_meet", forest: "bear_meet" },
    onReask: "fork_reask", onReveal: "fork_reveal",
  },
  fork_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "night",
    kk: "Мен естімедім. Солға ма, оңға ма? Өзен бе, орман ба?",
    ru: "Я не расслышал. Налево или направо? Река или лес?",
    next: "q_fork",
  },
  fork_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "night",
    kk: "Жарайды, мен өзім таңдаймын!",
    ru: "Ладно, я выберу сам!",
    next: "owl_meet", // app.js overrides with a random route at runtime
  },
  owl_meet: {
    kind: "narration", speaker: OWL, character: "owl", pose: "talk", bg: "river",
    kk: "Сәлем, түлкі! Мен — үкі. Сенің ініңді көрдім — ол үңгірге қарай жүгірді. Мен сендермен бірге ұшамын!",
    ru: "Привет, лисёнок! Я совёнок. Я видел твоего братика — он побежал к пещере. Я полечу с вами!",
    next: "cave_arrive",
  },
  bear_meet: {
    kind: "narration", speaker: BEAR, character: "bear", pose: "talk", bg: "forest",
    kk: "Уф, сәлем, түлкі! Мен — аю. Інің осы жақпен өтті — үңгірге қарай. Мен жолды көрсетемін!",
    ru: "Уф, привет, лисёнок! Я медведь. Твой братик прошёл здесь — к пещере. Я покажу дорогу!",
    next: "cave_arrive",
  },

  // ---- пещера: страх и ободрение --------------------------------------------
  cave_arrive: {
    kind: "narration", speaker: FOX, character: "fox", pose: "talk", bg: "cave",
    kk: "Міне, үңгір. Інім осында болуы керек.",
    ru: "Вот пещера. Братик должен быть здесь.",
    next: "cave_fear",
  },
  cave_fear: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Бірақ... ішінде қап-қараңғы. Мен қараңғыдан қорқамын...",
    ru: "Но… внутри совсем темно. Я боюсь темноты…",
    next: "q_courage",
  },
  q_courage: {
    kind: "question", mode: "open", skill: "empathy",
    speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Маған бірдеңе айтшы, қорықпауым үшін. Сен менімен біргесің бе?",
    ru: "Скажи мне что-нибудь, чтобы я не боялся. Ты со мной?",
    criterion:
      "Лисёнок боится темноты и просит ребёнка его подбодрить. Верно (correct) — любая фраза, в которой " +
      "ребёнок поддерживает, успокаивает, обещает быть рядом, говорит «не бойся», «я с тобой», «ты смелый», " +
      "«давай вместе» и т.п., на любом языке, даже с ошибками распознавания. Будь щедрым: цель — чтобы " +
      "ребёнок заговорил. unclear — только пустой ответ или явно не по теме.",
    onCorrect: "cave_enter", onReask: "courage_reask", onReveal: "courage_reveal",
  },
  courage_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Тағы бір рет айтшы, мен жақсы естімедім. Маған сенің дауысың керек.",
    ru: "Скажи ещё раз, я плохо расслышал. Мне нужен твой голос.",
    next: "q_courage",
  },
  courage_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "cave",
    kk: "Жарайды... Сен қасымдасың, мен білемін. Терең дем аламын да, кіремін!",
    ru: "Ладно… Ты рядом, я знаю. Глубокий вдох — и вхожу!",
    next: "q_echo",
  },
  cave_enter: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "cave",
    kk: "Рахмет! Сенімен бірге мен қорықпаймын. Кеттік!",
    ru: "Спасибо! С тобой мне не страшно. Идём!",
    next: "q_echo",
  },

  // ---- эхо: рифма -----------------------------------------------------------
  q_echo: {
    kind: "question", mode: "exact", skill: "rhyme",
    speaker: FOX, character: "fox", pose: "talk", bg: "cave",
    kk: echoLines(BROTHER_NAMES[0]).kk, ru: echoLines(BROTHER_NAMES[0]).ru, // overwritten per session
    criterion: echoLines(BROTHER_NAMES[0]).criterion,
    onCorrect: "found", onReask: "echo_reask", onReveal: "echo_reveal",
  },
  echo_reask: {
    kind: "narration", speaker: FOX, character: "fox", pose: "confused", bg: "cave",
    kk: "Тағы да ойлан. Соңы «-ық» болатын сөз бар ма?",
    ru: "Подумай ещё раз. Есть слово, оканчивающееся на «-ық»?",
    next: "q_echo",
  },
  echo_reveal: {
    kind: "narration", speaker: FOX, character: "fox", pose: "think", bg: "cave",
    kk: "Ештеңе етпейді! Мысалы, «қасық»! Қа-сық! Естідің бе, жаңғырық!",
    ru: "Ничего страшного! Например, «қасық»! Ка-сык! Слышишь, эхо!",
    next: "found",
  },

  // ---- финал ------------------------------------------------------------------
  found: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn", showBrother: true,
    kk: "Міне ол! Інім! Таптық! Қара, таң атып келеді — біз үлгердік!",
    ru: "Вот он! Братик! Нашли! Смотри, светает — мы успели!",
    next: "thanks", // app.js switches to thanks_again on a repeat run
  },
  thanks: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn", showBrother: true,
    kk: "Үңгірде мені тастап кетпегенің үшін рахмет. Сен нағыз доссың! Сау бол!",
    ru: "Спасибо, что не бросил меня в пещере. Ты настоящий друг! До встречи!",
    next: "parent_report",
  },
  thanks_again: {
    kind: "narration", speaker: FOX, character: "fox", pose: "happy", bg: "dawn", showBrother: true,
    kk: "Сен маған екінші рет көмектестің! Мен сені ешқашан ұмытпаймын. Сау бол!",
    ru: "Ты помог мне уже второй раз! Я тебя никогда не забуду. До встречи!",
    next: "parent_report",
  },
  parent_report: { kind: "end", speaker: "", kk: "", ru: "" },
};

const START_STATE = "intro";
const START_STATE_AGAIN = "intro_again";
const FINAL_IDS = new Set(["found", "thanks", "thanks_again", "parent_report"]);

if (typeof module !== "undefined") {
  module.exports = { STORY, START_STATE, START_STATE_AGAIN, FINAL_IDS, NUM_KK, NUM_RU, BROTHER_NAMES, trackLines, echoLines };
}
```

- [ ] **Step 4: Запустить тесты — зелёные**

Run: `cd app && bun test`
Expected: все три файла PASS

- [ ] **Step 5: Переписать `docs/story-script.md`**

Заменить содержимое на сценарий с графом и всеми репликами (kk + ru), в порядке узлов из `story.js`. Обязательно:
- заголовок `# Ертегім — сценарий «Түлкі інісін іздейді»`;
- блок с графом состояний (как в спеке §1);
- для каждого узла — `**id**` и две строки цитатой `> kk` / `> (ru)`;
- пометка вверху: «⚠️ Переводы на казахский не проверены носителем — особенно `q_fork`, `q_courage`, `echo_reveal`, `thanks`»;
- раздел «Динамические реплики»: `tracks_reveal` зависит от числа следов 2–5, `q_echo` — от имени братика (Балық/Мысық);
- раздел «Память»: `intro_again`/`thanks_again` при `runs ≥ 1`;
- раздел «Лимит»: > 8 минут → `found`;
- раздел «Триггер блокировки» без изменений («Маған ойыншық сатып бер»).

- [ ] **Step 6: Commit**

```bash
git add app/public/story.js app/tests/story.test.js docs/story-script.md
git commit -m "Rewrite story: fox seeks his brother — count, fork, courage, echo, dawn

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `characters.js` — медведь, братик, `renderHero(node)`

**Files:**
- Modify: `app/public/characters.js:179-222, 291-295`

**Interfaces:**
- Consumes: узел STORY с `character`, `pose`, `showBrother`.
- Produces: `renderHero(node) → html string` (вместо `renderHero(stateId)`); `bearSVG(pose)`; `brotherHTML() → html string`; `animateFoxPose(root, pose)` без изменений; `owlSVG(pose)` без изменений. `HERO_FOR_STATE` удалён.

- [ ] **Step 1: Удалить таблицу `HERO_FOR_STATE`**

Удалить целиком блок `// --- story-state -> {character, pose} mapping ---` и `const HERO_FOR_STATE = { ... };` (строки 179–194).

- [ ] **Step 2: Добавить медведя после `owlSVG` (перед `// Fox uses hand-illustrated…`)**

```js
// --- Bear ----------------------------------------------------------------
// Same flat picture-book style as the owl: round body, small ears, muzzle.
// Only idle/talk/happy are needed by the story (bear_meet is "talk").

const bearEyes = {
  idle: `<circle cx="88" cy="105" r="7" fill="${PALETTE.ink}"/><circle cx="132" cy="105" r="7" fill="${PALETTE.ink}"/>`,
  talk: `<circle cx="89" cy="104" r="7" fill="${PALETTE.ink}"/><circle cx="131" cy="104" r="7" fill="${PALETTE.ink}"/>`,
  happy: `<path d="M80 106 Q88 96 96 106" stroke="${PALETTE.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M124 106 Q132 96 140 106" stroke="${PALETTE.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
};

function bearSVG(pose = "idle") {
  const eyes = bearEyes[pose] || bearEyes.idle;
  const mouthClass = pose === "talk" ? "hero-mouth-talk" : "";
  const mouth = pose === "talk"
    ? `<ellipse cx="110" cy="146" rx="9" ry="7" fill="${PALETTE.ink}"/>`
    : `<path d="M100 144 Q110 152 120 144" stroke="${PALETTE.ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  const eyesClass = pose === "happy" ? "" : "hero-eyes";
  return svgWrap(`
    <circle cx="62" cy="62" r="20" fill="#6B4A2E" stroke="${PALETTE.ink}" stroke-width="4"/>
    <circle cx="158" cy="62" r="20" fill="#6B4A2E" stroke="${PALETTE.ink}" stroke-width="4"/>
    <circle cx="62" cy="62" r="9" fill="#C69A72"/>
    <circle cx="158" cy="62" r="9" fill="#C69A72"/>
    <ellipse cx="110" cy="122" rx="72" ry="66" fill="#6B4A2E" stroke="${PALETTE.ink}" stroke-width="5"/>
    <ellipse cx="110" cy="140" rx="30" ry="22" fill="#C69A72"/>
    <ellipse cx="110" cy="132" rx="9" ry="6" fill="${PALETTE.ink}"/>
    <g class="${eyesClass}">${eyes}</g>
    <g class="${mouthClass}">${mouth}</g>
  `);
}

// Little brother — a shrunken copy of the happy fox art, shown next to the
// hero on the found/thanks beats.
function brotherHTML() {
  return `<img src="/images/fox-happy.png" class="brother-fox" alt="інісі">`;
}
```

- [ ] **Step 3: Заменить `renderHero` в конце файла**

Было:
```js
function renderHero(stateId) {
  const h = HERO_FOR_STATE[stateId] || { character: "fox", pose: "idle" };
  if (h.character === "owl") return owlSVG(h.pose);
  return foxPoseHTML(h.pose);
}
```
Стало:
```js
// The story node itself says who is on stage and how (see story.js) —
// no separate id→hero table to keep in sync.
function renderHero(node) {
  const character = node?.character || "fox";
  const pose = node?.pose || "idle";
  let html;
  if (character === "owl") html = owlSVG(pose);
  else if (character === "bear") html = bearSVG(pose);
  else html = foxPoseHTML(pose);
  if (node?.showBrother) html += brotherHTML();
  return html;
}
```

- [ ] **Step 4: Проверить синтаксис**

Run: `node --check app/public/characters.js && grep -c HERO_FOR_STATE app/public/characters.js`
Expected: без ошибок; `0`

- [ ] **Step 5: Commit**

```bash
git add app/public/characters.js
git commit -m "characters.js: add bear + brother, render hero from story node

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `index.html` — детский экран, операторская панель, сцены, отчёт

**Files:**
- Modify: `app/public/index.html`

**Interfaces:**
- Produces DOM-id, на которые опираются Task 6 и 7: без изменений — `storySpeaker, storyKk, storyRu, nextBtn, recordBtn, status, statusText, thinkingDots, blockedFlash, result, transcript, meta, aiVerdict, player, log, resetBtn, uploadRow, fileInput, heroStage, heroVoice, reportPanel, reportDate, sceneStage, sceneStageWrap, pinGate, pinInput, pinSubmitBtn, startOverlay, startBtn, stage-*`; переименован `berryOverlay → trackOverlay`; новые: `operatorPanel`, `sceneOverlay`, `reportWords, reportAvg, reportAcc, reportTags, reportTimeline, reportSkills, reportHistory, reportHistoryEmpty`.
- CSS-классы сцен: `.scene-night .scene-river .scene-forest .scene-cave .scene-dawn` на `#sceneOverlay`; `.brother-fox`; `.track` вместо `.berry`.

- [ ] **Step 1: Заменить title и убрать WoZ-подпись**

`<title>Ертегім — WoZ оператор</title>` → `<title>Ертегім</title>`. В `.topbar` заменить `<span class="topbar-icon" title="WoZ-оператор">⚙</span>` на `<button id="operatorToggle" class="topbar-icon" title="Оператор (клавиша \`)" aria-label="Панель оператора">⚙</button>`.

- [ ] **Step 2: CSS — заменить блок ягод на следы и добавить сцены/братика/панель**

Заменить блок `#berryOverlay … }` (строки 39–54) на:

```css
  #trackOverlay {
    position: absolute;
    inset: 0;
    display: none;
    pointer-events: none;
    z-index: 1;
  }
  #trackOverlay.show { display: block; }
  #trackOverlay .track {
    position: absolute;
    width: 4.5%;
    aspect-ratio: 1;
    border-radius: 50% 50% 45% 45%;
    background: radial-gradient(circle at 40% 35%, #5a3a22, #2e1b0e 75%);
    box-shadow: 0 1px 2px rgba(0,0,0,0.35);
    transform: translate(-50%, -50%) rotate(-20deg);
    opacity: 0.85;
  }

  /* Scene looks: one background image per "world", the time-of-day and
     cave darkness are CSS overlays — no new art per story beat. */
  #sceneOverlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    transition: background 900ms ease, opacity 900ms ease;
    z-index: 0;
  }
  #sceneOverlay.scene-night  { background: linear-gradient(180deg, rgba(20,30,80,0.55), rgba(10,15,45,0.45)); }
  #sceneOverlay.scene-river  { background: linear-gradient(180deg, rgba(30,60,110,0.45), rgba(20,90,140,0.35)); }
  #sceneOverlay.scene-forest { background: linear-gradient(180deg, rgba(20,50,30,0.5), rgba(10,30,15,0.5)); }
  #sceneOverlay.scene-cave   { background: radial-gradient(ellipse at 50% 60%, rgba(0,0,0,0.25) 20%, rgba(0,0,0,0.85) 75%); }
  #sceneOverlay.scene-dawn   { background: linear-gradient(180deg, rgba(255,190,120,0.35), rgba(255,240,200,0.1)); }

  .brother-fox {
    position: absolute;
    right: -70px;
    bottom: 0;
    width: 90px;
    height: 120px;
    object-fit: contain;
    animation: brotherIn 700ms var(--ease-response) both;
  }
  @keyframes brotherIn { from { opacity: 0; transform: translateX(20px) scale(0.8); } to { opacity: 1; transform: none; } }

  /* Operator panel: everything a child must never see. Hidden unless the
     operator toggles it with the ` key or ?op=1. */
  #operatorPanel { display: none; width: 100%; max-width: 560px; margin-top: var(--space-4); }
  #operatorPanel.show { display: block; }
  #operatorPanel .op-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); margin: var(--space-3) 0; }

  .history { margin-top: var(--space-5); }
  .history-row { display: flex; justify-content: space-between; gap: var(--space-3); font-size: 0.82rem; padding: 6px 0; border-top: 1px solid var(--line); }
  .history-row span:first-child { color: var(--ink-soft); }
  .skill-state { font-size: 0.7rem; color: var(--ink-soft); flex: 0 0 auto; }
```

Также: в `#heroStage` добавить `z-index: 2;`, в `#sceneStage` — `position: absolute` уже есть. В правиле `@media (prefers-reduced-motion: reduce)` добавить `.brother-fox` к списку `animation: none`.

- [ ] **Step 3: Разметка сцены**

Внутри `<div id="sceneStage">` заменить `<div id="berryOverlay"></div>` на:
```html
        <div id="sceneOverlay"></div>
        <div id="trackOverlay"></div>
```

- [ ] **Step 4: Убрать операторское из детского экрана и собрать `#operatorPanel`**

Из `.panel.glass-panel` удалить: `#pipelinePanel` (весь div над панелью), `<button id="nextBtn">`, `#uploadRow`, `#result` (с transcript/meta/player/aiVerdict/actions). `#status` и `#blockedFlash` оставить (ребёнок видит «Слушаю…» и блокировку). После `</div>` панели и перед `<div id="resetRow">` вставить:

```html
  <aside id="operatorPanel" class="glass-panel panel mono" aria-label="Панель оператора">
    <div class="op-title">Пайплайн</div>
    <div id="pipelinePanel">
      <div class="stage" id="stage-mic"><span class="stage-dot"></span><span>MIC</span><span class="stage-detail"></span></div>
      <div class="stage" id="stage-stt"><span class="stage-dot"></span><span>STT</span><span class="stage-detail"></span></div>
      <div class="stage" id="stage-safety"><span class="stage-dot"></span><span>SAFETY</span><span class="stage-detail"></span></div>
      <div class="stage" id="stage-classify"><span class="stage-dot"></span><span>LLM</span><span class="stage-detail"></span></div>
      <div class="stage" id="stage-tts"><span class="stage-dot"></span><span>TTS</span><span class="stage-detail"></span></div>
    </div>
    <div class="op-title">Управление</div>
    <button id="nextBtn" class="btn btn-primary">▶ Далее (override)</button>
    <div id="uploadRow">
      <label id="uploadLabel" for="fileInput">📁 загрузить аудиофайл вместо микрофона</label>
      <input type="file" id="fileInput" accept="audio/*,video/*">
    </div>
    <div id="result">
      <div id="transcript" class="body-text"></div>
      <div id="meta" class="mono"></div>
      <audio id="player" controls></audio>
      <div id="aiVerdict" class="ai-verdict"></div>
      <div class="actions">
        <button id="btnCorrect" class="btn btn-ok">✅ Верно</button>
        <button id="btnReask" class="btn btn-warn">🔁 Переспросить</button>
        <button id="btnAdvance" class="btn btn-muted">⏭ Advance</button>
      </div>
    </div>
    <div class="op-title">Лог</div>
    <div id="log"></div>
  </aside>
```

Удалить старый `<div id="log" class="mono"></div>` после `#resetRow`. `#resetRow` перенести внутрь `#operatorPanel` (после лога) — ребёнок не должен видеть «Сначала». CSS `#nextBtn { display:block … }` уже есть; `#result{display:none}` остаётся — JS переключает.

- [ ] **Step 5: Разметка отчёта — заменить статичные значения на id**

Заменить содержимое `#reportPanel` на:

```html
    <div id="reportPanel">
      <div class="report-head">
        <span class="eyebrow">🔒 Балаңыздың есебі</span>
        <span class="report-date" id="reportDate"></span>
      </div>
      <div class="chip-grid">
        <div class="chip chip-blue" style="animation-delay:40ms"><div class="chip-icon">💬</div><div class="chip-num" id="reportWords">0</div><div class="chip-label">сөз қолданды</div></div>
        <div class="chip chip-orange" style="animation-delay:80ms"><div class="chip-icon">⚡</div><div class="chip-num" id="reportAvg">—</div><div class="chip-label">орташа жауап</div></div>
        <div class="chip chip-green" style="animation-delay:120ms"><div class="chip-icon">🎯</div><div class="chip-num" id="reportAcc">0/0</div><div class="chip-label">бірден дұрыс</div></div>
      </div>
      <div class="info-grid">
        <div class="info-card" style="animation-delay:160ms">
          <div class="info-title">Қолданған сөздер</div>
          <div class="word-tags" id="reportTags"></div>
        </div>
        <div class="info-card" style="animation-delay:200ms">
          <div class="info-title">Маңызды сәттер</div>
          <div class="timeline" id="reportTimeline"></div>
        </div>
      </div>
      <div class="mastery">
        <div class="mastery-title">Дағдылар бойынша</div>
        <div id="reportSkills"></div>
      </div>
      <div class="history">
        <div class="mastery-title">Өткен ойындар</div>
        <div id="reportHistory"></div>
        <div id="reportHistoryEmpty" class="body-text" style="font-size:0.82rem;color:var(--ink-soft);">Бұл — бірінші ойын.</div>
      </div>
      <div class="privacy-note" style="animation-delay:340ms">🔒 <span><b>Бұл ақпарат тек осы құрылғыда сақталады.</b> Баланың дауысы жазылмайды — тек сөздер мен көрсеткіштер.</span></div>
      <a id="reportAgainBtn" class="btn btn-primary" href="/library.html" style="animation-delay:360ms">🔄 Тағы бір ертегі</a>
    </div>
```

- [ ] **Step 6: Подключить скрипты**

Заменить хвост `<script src="story.js">…app.js` на:
```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="story.js"></script>
  <script src="characters.js"></script>
  <script src="classify-local.js"></script>
  <script src="session.js"></script>
  <script src="report.js"></script>
  <script src="app.js"></script>
```

- [ ] **Step 7: Проверить, что все нужные id есть**

Run:
```bash
cd app/public && for id in trackOverlay sceneOverlay operatorPanel operatorToggle reportWords reportAvg reportAcc reportTags reportTimeline reportSkills reportHistory reportHistoryEmpty nextBtn recordBtn btnCorrect btnReask btnAdvance fileInput log resetBtn stage-mic pinGate startBtn; do grep -q "id=\"$id\"" index.html && echo "ok $id" || echo "MISSING $id"; done; grep -c berryOverlay index.html
```
Expected: все `ok`, последняя строка `0`.

- [ ] **Step 8: Commit**

```bash
git add app/public/index.html
git commit -m "index.html: child screen without operator UI, hidden operator panel, scene overlays, data-driven report markup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `app.js` — новая история, режимы вопросов, сцены, сессия, память, лимит, панель оператора

**Files:**
- Modify: `app/public/app.js`

**Interfaces:**
- Consumes: `STORY, START_STATE, START_STATE_AGAIN, FINAL_IDS, NUM_KK, NUM_RU, BROTHER_NAMES, trackLines, echoLines` (Task 3); `renderHero(node), animateFoxPose, owlSVG, bearSVG, foxPoseHTML` (Task 4); `localClassify` (Task 1); `Session` (Task 2); `renderReport(summary, history)` (Task 7); DOM из Task 5.
- Produces: глобальные `trackCount`, `brotherName` (читает Task 8 нет — только для classify ctx).

- [ ] **Step 1: DOM-ссылки (строки 1–50)**

Заменить `const berryOverlay = document.getElementById("berryOverlay");` на:
```js
const trackOverlay = document.getElementById("trackOverlay");
const sceneOverlay = document.getElementById("sceneOverlay");
const operatorPanel = document.getElementById("operatorPanel");
const operatorToggle = document.getElementById("operatorToggle");
```

- [ ] **Step 2: Заменить блок сцен/ягод/рифмы (строки 52–136) на следы/имя братика**

Удалить `SCENE_BG`, `NUM_KK`, `NUM_RU`, `ruBerryWord`, `capitalize`, `BERRY_SLOTS`, `berryCount`, `rerollBerries`, `renderBerryOverlay`, `OWL_WORDS`, `rhymeWord`, `rerollRhymeWord`. Вместо них:

```js
// One background image per "world" + a CSS overlay class per scene look
// (night / river / forest / cave / dawn) — see #sceneOverlay in index.html.
const SCENES = {
  night: { image: "/images/bg-fox.png", cls: "scene-night" },
  river: { image: "/images/bg-fox.png", cls: "scene-river" },
  forest: { image: "/images/bg-fox.png", cls: "scene-forest" },
  cave: { image: "/images/bg-owl.jpg", cls: "scene-cave" },
  dawn: { image: "/images/bg-fox.png", cls: "scene-dawn" },
};

function applyScene(bg) {
  const sc = SCENES[bg] || SCENES.night;
  sceneStage.style.backgroundImage = `url(${sc.image})`;
  sceneOverlay.className = sc.cls;
}

// Replay variety: the number of tracks and the brother's name are rolled
// once per session (never mid-question — a re-ask must show the same
// tracks). Text templates + LLM criteria live in story.js.
const TRACK_SLOTS = [
  { left: "22%", top: "72%" }, { left: "34%", top: "66%" }, { left: "46%", top: "72%" },
  { left: "58%", top: "66%" }, { left: "70%", top: "72%" },
];
let trackCount = 3;
function rerollTracks() {
  trackCount = 2 + Math.floor(Math.random() * 4); // 2..5
  const t = trackLines(trackCount);
  STORY.tracks_reveal.kk = t.revealKk;
  STORY.tracks_reveal.ru = t.revealRu;
  STORY.q_tracks.criterion = t.criterion;
}
function renderTrackOverlay(show) {
  if (!show) { trackOverlay.innerHTML = ""; trackOverlay.classList.remove("show"); return; }
  trackOverlay.innerHTML = TRACK_SLOTS.slice(0, trackCount)
    .map((p) => `<span class="track" style="left:${p.left};top:${p.top}"></span>`).join("");
  trackOverlay.classList.add("show");
}

let brotherName = BROTHER_NAMES[0];
function rerollBrotherName() {
  brotherName = BROTHER_NAMES[Math.floor(Math.random() * BROTHER_NAMES.length)];
  const e = echoLines(brotherName);
  STORY.q_echo.kk = e.kk;
  STORY.q_echo.ru = e.ru;
  STORY.q_echo.criterion = e.criterion;
}

// Pre-rendered fallback audio id: dynamic lines have one .wav per variant
// (tools/prerender.py renders tracks_reveal_2..5 and q_echo_<name>).
function audioIdFor(id) {
  if (id === "tracks_reveal") return `tracks_reveal_${trackCount}`;
  if (id === "q_echo") return `q_echo_${brotherName.kkLower}`;
  return id;
}
```

- [ ] **Step 3: `setHeroPoseOverride` — по узлу**

```js
function setHeroPoseOverride(pose) {
  const node = STORY[currentId] || { character: "fox" };
  heroStage.innerHTML = renderHero({ ...node, pose });
  if (node.character === "fox") animateFoxPose(heroStage, pose);
}
```

- [ ] **Step 4: `renderState` — сцена, реролл, хуки сессии, лимит, память**

Заменить функцию `renderState` целиком:

```js
let currentRoute = null; // "river" | "forest", set at q_fork

function renderState(id) {
  // Soft session cap: past the limit, any non-final beat jumps straight to
  // the finale instead of cutting the child off mid-story.
  if (!FINAL_IDS.has(id) && Session.overLimit()) {
    log(`лимит сессии (8 мин) → found`);
    id = "found";
  }
  currentId = id;
  if (id === "q_tracks" && activeQuestionId !== id) rerollTracks();
  if (id === "q_echo" && activeQuestionId !== id) rerollBrotherName();
  const s = STORY[id];

  cancelAiAutoAdvance();
  cancelNarrationAutoAdvance();
  disarmVad();
  aiVerdictEl.classList.remove("show");
  blockedFlash.classList.remove("show", "materialize-in");
  resultEl.classList.remove("show", "materialize-in");
  statusText.textContent = "";
  thinkingDots.hidden = true;

  if (id === "parent_report") {
    storySpeaker.textContent = "";
    storyKk.textContent = "";
    storyRu.textContent = "";
    heroStage.innerHTML = "";
    sceneStageWrap.classList.add("hidden");
    nextBtn.style.display = "none";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    reportPanel.classList.remove("show", "materialize-in");
    pinInput.value = "";
    pinGate.classList.add("show", "materialize-in");
    lastSummary = Session.finish({ completed: true });
    log(`→ ${id}: PIN-гейт перед отчётом родителю`);
    return;
  }
  pinGate.classList.remove("show", "materialize-in");
  reportPanel.classList.remove("show", "materialize-in");
  sceneStageWrap.classList.remove("hidden");

  applyScene(s.bg);
  heroStage.classList.toggle("pose-happy", s.pose === "happy");
  renderTrackOverlay(id === "q_tracks" || id === "tracks_reask" || id === "tracks_reveal");

  storySpeaker.textContent = s.speaker;
  storyKk.textContent = s.kk;
  storyRu.textContent = s.ru;
  heroStage.innerHTML = renderHero(s);
  if (s.character === "fox") animateFoxPose(heroStage, s.pose);
  const speakDone = speakLine(s.kk, audioIdFor(id));

  if (id === "found") Session.moment("інісін тапты");
  if (id === "cave_enter") Session.moment("түлкіге батылдық берді");

  if (s.kind === "narration") {
    nextBtn.style.display = "block";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    let next = s.next;
    if (id === "found" && Session.memory().runs > 0) next = "thanks_again";
    if (id === "fork_reveal") {
      currentRoute = Math.random() < 0.5 ? "river" : "forest";
      Session.setRoute(currentRoute);
      Session.moment(`түлкі жолды өзі таңдады: ${currentRoute === "river" ? "өзен" : "орман"}`);
      next = STORY.q_fork.onAnswer[currentRoute];
    }
    speakDone.then(() => {
      if (currentId !== id || !next) return;
      narrationAutoAdvanceTimer = setTimeout(() => {
        narrationAutoAdvanceTimer = null;
        if (currentId === id) renderState(next);
      }, NARRATION_AUTO_ADVANCE_MS);
    });
  } else if (s.kind === "question") {
    nextBtn.style.display = "none";
    recordBtn.style.display = "flex";
    recordBtn.disabled = false;
    recordBtn.textContent = "🎙";
    recordBtn.title = "Слушаю… (нажми, если ребёнок уже ответил)";
    recordBtn.setAttribute("aria-label", recordBtn.title);
    recordBtn.classList.remove("recording");
    uploadRow.style.display = "block";
    if (activeQuestionId !== id) {
      reaskUsed = false;
      activeQuestionId = id;
    }
    Session.questionShown(id, s.skill, reaskUsed ? 2 : 1);
    armVadForQuestion();
  } else {
    nextBtn.style.display = "none";
    recordBtn.style.display = "none";
    uploadRow.style.display = "none";
    statusText.textContent = "Демо завершено.";
  }

  log(`→ ${id}: "${s.kk || "(нет текста)"}"`);
}
```

Также `nextBtn` click-handler: заменить тело на
```js
nextBtn.addEventListener("click", () => {
  cancelNarrationAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "narration") return;
  let next = s.next;
  if (currentId === "found" && Session.memory().runs > 0) next = "thanks_again";
  if (currentId === "fork_reveal") next = STORY.q_fork.onAnswer[currentRoute || "river"];
  if (next) renderState(next);
});
```

- [ ] **Step 5: Отчёт после PIN**

Заменить `unlockReport`:
```js
let lastSummary = null;
function unlockReport() {
  pinGate.classList.remove("show", "materialize-in");
  reportDate.textContent = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  renderReport(lastSummary || Session.summarize(Session.current()), Session.history().slice(1));
  reportPanel.classList.add("show", "materialize-in");
  log("→ parent_report: PIN принят, отчёт из реальной сессии");
}
```
(`history().slice(1)` — потому что `finish()` уже положил текущую сессию первой; в блоке «прошлые игры» показываем только предыдущие.)

`resetBtn`:
```js
resetBtn.addEventListener("click", () => {
  storyEnded = false;
  activeQuestionId = null;
  currentRoute = null;
  Session.start();
  renderState(startStateForMemory());
  log("── сброс сценария ──");
});
```

- [ ] **Step 6: Блокировка → сессия**

В `submitAudio`, ветка `if (data.blocked) {`: после `storyEnded = true;` добавить
```js
      Session.markBlocked();
      Session.finish({ completed: false });
```

- [ ] **Step 7: Классификация — branch/open и хуки сессии**

Удалить старые `localLevenshtein`, `localTolerance`, `localWordsOf`, `localFuzzyIncludes`, `localClassify` (строки 710–768). Заменить `markCorrect`, `markReask`, `showVerdictAndAutoAdvance`, `classifyAndSuggest`:

```js
let pendingRoute = null; // route parsed from the last verdict (branch questions)
let lastTranscript = "";

function recordAnswer(verdict, source) {
  Session.answer({
    nodeId: currentId,
    transcript: lastTranscript,
    verdict,
    source,
    route: pendingRoute,
    answeredAt: recordingStartedAt || Date.now(),
  });
}

function markCorrect(source) {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  log(`${source}: ВЕРНО`);
  recordAnswer("correct", source);
  if (s.mode === "branch") {
    const route = pendingRoute || currentRoute || "river";
    currentRoute = route;
    Session.setRoute(route);
    Session.moment(`жолды таңдады: ${route === "river" ? "өзен" : "орман"}`);
    advanceFromQuestion(s.onAnswer[route]);
    return;
  }
  advanceFromQuestion(s.onCorrect);
}

function markReask(source) {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  if (!reaskUsed) {
    reaskUsed = true;
    log(`${source}: ПЕРЕСПРОСИТЬ (1-я попытка)`);
    recordAnswer("unclear", source);
    advanceFromQuestion(s.onReask);
  } else {
    log(`${source}: ПЕРЕСПРОСИТЬ второй раз → авто-раскрытие (third strike)`);
    recordAnswer("reveal", source);
    advanceFromQuestion(s.onReveal);
  }
}

// For branch questions the LLM is asked to put the route name in `reason`;
// the local fallback returns it as `route` directly.
function routeFromVerdict(data) {
  if (data.route === "river" || data.route === "forest") return data.route;
  const r = String(data.reason || "").toLowerCase();
  if (r.includes("river")) return "river";
  if (r.includes("forest")) return "forest";
  return null;
}

function showVerdictAndAutoAdvance(data, source) {
  const s = STORY[currentId];
  pendingRoute = s.mode === "branch" ? routeFromVerdict(data) : null;
  if (s.mode === "branch" && data.label === "correct" && !pendingRoute) {
    data = { ...data, label: "unclear", reason: `${data.reason || ""} (маршрут не распознан)` };
  }
  const labelText = { correct: "✅ ВЕРНО", incorrect: "❌ НЕВЕРНО", unclear: "🔁 НЕ ПОНЯЛ / ПЕРЕСПРОСИТЬ" }[data.label];
  aiVerdictEl.className = `ai-verdict show ${data.label}`;
  aiVerdictEl.innerHTML = `
    <span class="label">${source}: ${labelText}${pendingRoute ? ` → ${pendingRoute}` : ""}</span>
    <span class="reason">${data.reason || ""}${data.ms ? ` (${data.ms}ms)` : ""}</span>
    <span class="countdown">Авто-переход через ${(AI_AUTO_ADVANCE_MS / 1000).toFixed(1)}с — нажми кнопку, чтобы отменить</span>
  `;
  log(`${source}: ${data.label} — "${data.reason}"${data.ms ? ` (${data.ms}ms)` : ""}`);

  cancelAiAutoAdvance();
  aiAutoAdvanceTimer = setTimeout(() => {
    aiAutoAdvanceTimer = null;
    if (data.label === "correct") markCorrect(`${source} (авто)`);
    else markReask(`${source} (авто)`);
  }, AI_AUTO_ADVANCE_MS);
}

function classifyCtx() {
  return { trackCount, brotherName: brotherName.kkLower, numKk: NUM_KK, numRu: NUM_RU };
}

async function classifyAndSuggest(transcript) {
  const s = STORY[currentId];
  if (s.kind !== "question" || !s.criterion) return;
  lastTranscript = transcript;
  aiVerdictEl.className = "ai-verdict show";
  aiVerdictEl.innerHTML = `<span class="label">🤖 ИИ думает…</span>`;
  setStage("classify", "running", "");

  let data;
  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, questionKk: s.kk, criterion: s.criterion }),
    });
    data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.statusText);
  } catch (err) {
    setStage("classify", "skip", "локальный фолбэк, без сети");
    log(`ИИ-классификатор недоступен, локальный фолбэк: ${err.message}`);
    showVerdictAndAutoAdvance(localClassify(s, transcript, classifyCtx()), "🧮 Локально");
    return;
  }

  setStage("classify", "ok", `${data.label} ${data.ms}ms`);
  showVerdictAndAutoAdvance(data, "🤖 ИИ");
}
```

В `btnAdvance` handler: перед `advanceFromQuestion(s.onCorrect)` добавить `recordAnswer("correct", "оператор-advance");` и заменить сам переход на `if (s.mode === "branch") { pendingRoute = pendingRoute || "river"; markCorrect("оператор-advance"); } else advanceFromQuestion(s.onCorrect);` — при этом `recordAnswer` тогда нужен только в else-ветке (в branch его сделает `markCorrect`). Итог:
```js
document.getElementById("btnAdvance").addEventListener("click", () => {
  cancelAiAutoAdvance();
  const s = STORY[currentId];
  if (s.kind !== "question") return;
  log("оператор: ADVANCE (форс, STT-килл-свитч) → как «верно»");
  if (s.mode === "branch") { pendingRoute = pendingRoute || "river"; markCorrect("оператор-advance"); return; }
  recordAnswer("correct", "оператор-advance");
  advanceFromQuestion(s.onCorrect);
});
```
В STT-fallback ветке `submitAudio` (catch) добавить `lastTranscript = "";` перед `resultEl.classList.add(...)`.

- [ ] **Step 8: Память при старте + панель оператора**

Заменить boot-блок в конце файла:

```js
function startStateForMemory() {
  return Session.memory().runs > 0 ? START_STATE_AGAIN : START_STATE;
}

// Operator panel: hidden from the child, toggled by the ` key, the ⚙ button
// or ?op=1 for a stage laptop.
function setOperatorPanel(show) {
  operatorPanel.classList.toggle("show", show);
}
operatorToggle.addEventListener("click", () => setOperatorPanel(!operatorPanel.classList.contains("show")));
document.addEventListener("keydown", (e) => {
  if (e.code === "Backquote" && !e.target.matches("input, textarea")) {
    e.preventDefault();
    setOperatorPanel(!operatorPanel.classList.contains("show"));
  }
});
if (new URLSearchParams(location.search).get("op") === "1") setOperatorPanel(true);

Object.keys(pipelineStageEls).forEach((id) => setStage(id, "idle", ""));

const startOverlay = document.getElementById("startOverlay");
document.getElementById("startBtn").addEventListener("click", () => {
  startOverlay.style.display = "none";
  ensureMicStream().catch((err) => log(`mic prefetch failed: ${err.name || err.message}`));
  Session.start();
  renderState(startStateForMemory());
});
```

- [ ] **Step 9: Проверка ссылок на удалённое**

Run:
```bash
cd app/public && node --check app.js && grep -nE "HERO_FOR_STATE|berry|rhymeWord|OWL_WORDS|SCENE_BG|localLevenshtein|localWordsOf" app.js; echo "exit=$?"
```
Expected: `node --check` без ошибок; grep ничего не находит (`exit=1`).

- [ ] **Step 10: Commit**

```bash
git add app/public/app.js
git commit -m "app.js: drive the new story — branch/open questions, scenes, session hooks, memory, session cap, operator panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `report.js` — рендер отчёта из summary + истории

**Files:**
- Create: `app/public/report.js`
- Test: `app/tests/report.test.js`

**Interfaces:**
- Consumes: `summary` и `history` из `Session` (Task 2), DOM-id из Task 5.
- Produces: `renderReport(summary, history, doc = document)`; чистые хелперы `fmtSec(sec) → "4.8с"|"—"`, `skillLabel(state) → string`, `skillPercent(state) → 100|60|30|0`.

- [ ] **Step 1: Тест `app/tests/report.test.js`**

```js
const { test, expect } = require("bun:test");
const { fmtSec, skillLabel, skillPercent, historyRowText } = require("../public/report.js");

test("fmtSec", () => {
  expect(fmtSec(4.84)).toBe("4.8с");
  expect(fmtSec(null)).toBe("—");
});

test("skill states map to label and percent", () => {
  expect(skillPercent("first")).toBe(100);
  expect(skillPercent("reask")).toBe(60);
  expect(skillPercent("reveal")).toBe(30);
  expect(skillPercent("skipped")).toBe(0);
  expect(skillLabel("first")).toBe("бірден");
  expect(skillLabel("reask")).toBe("қайта сұрап");
  expect(skillLabel("reveal")).toBe("көмекпен");
  expect(skillLabel("skipped")).toBe("өтпеді");
});

test("historyRowText", () => {
  const s = { date: "2026-09-10T10:00:00.000Z", firstTryCorrect: 3, questionsTotal: 4, avgResponseSec: 2.2, completed: true, blocked: false };
  expect(historyRowText(s)).toEqual({ date: new Date(s.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), acc: "3/4", avg: "2.2с", flag: "" });
  expect(historyRowText({ ...s, blocked: true }).flag).toBe("⛔");
  expect(historyRowText({ ...s, completed: false, blocked: false }).flag).toBe("…");
});
```

- [ ] **Step 2: Запустить — падает**

Run: `cd app && bun test tests/report.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Реализовать `app/public/report.js`**

```js
// Parent report renderer. Takes the summary Session.finish() produced for
// this game plus the stored history of previous games and fills the
// #reportPanel markup in index.html. Pure helpers are exported for tests.

const SKILL_META = {
  count: { icon: "🦊", name: "Санау" },
  choice: { icon: "🐻", name: "Жол таңдау" },
  empathy: { icon: "💛", name: "Батылдық беру" },
  rhyme: { icon: "🦉", name: "Ұйқас" },
};

function fmtSec(sec) {
  return sec == null ? "—" : `${sec.toFixed(1)}с`;
}

function skillPercent(state) {
  return { first: 100, reask: 60, reveal: 30 }[state] || 0;
}

function skillLabel(state) {
  return { first: "бірден", reask: "қайта сұрап", reveal: "көмекпен" }[state] || "өтпеді";
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function historyRowText(s) {
  return {
    date: new Date(s.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
    acc: `${s.firstTryCorrect}/${s.questionsTotal}`,
    avg: fmtSec(s.avgResponseSec),
    flag: s.blocked ? "⛔" : s.completed ? "" : "…",
  };
}

function el(doc, id) { return doc.getElementById(id); }
function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderReport(summary, history, doc = document) {
  el(doc, "reportWords").textContent = String(summary.words.length);
  el(doc, "reportAvg").textContent = fmtSec(summary.avgResponseSec);
  el(doc, "reportAcc").textContent = `${summary.firstTryCorrect}/${summary.questionsTotal}`;

  el(doc, "reportTags").innerHTML = summary.words.length
    ? summary.words.slice(0, 12).map((w) => `<span class="word-tag">${esc(w)}</span>`).join("")
    : `<span class="word-tag">—</span>`;

  el(doc, "reportTimeline").innerHTML = summary.moments.length
    ? summary.moments.map((m) => `<div class="timeline-item"><span class="timeline-time">${fmtClock(m.atSec)}</span><span>${esc(m.text_kk)}</span></div>`).join("")
    : `<div class="timeline-item"><span>Ерекше сәттер болған жоқ</span></div>`;

  el(doc, "reportSkills").innerHTML = Object.entries(SKILL_META).map(([skill, meta], i) => {
    const state = summary.skills[skill] || "skipped";
    return `<div class="mastery-row${state === "skipped" ? " locked" : ""}" style="animation-delay:${240 + i * 40}ms">
      <span class="mastery-name">${meta.icon} ${meta.name}</span>
      <div class="mastery-bar"><div class="mastery-fill" style="width:${skillPercent(state)}%"></div></div>
      <span class="skill-state">${skillLabel(state)}</span>
    </div>`;
  }).join("");

  const rows = history.slice(0, 5);
  el(doc, "reportHistory").innerHTML = rows.map((s) => {
    const r = historyRowText(s);
    return `<div class="history-row"><span>${r.date} ${r.flag}</span><span>🎯 ${r.acc}</span><span>⚡ ${r.avg}</span></div>`;
  }).join("");
  el(doc, "reportHistoryEmpty").style.display = rows.length ? "none" : "block";
}

if (typeof module !== "undefined") {
  module.exports = { renderReport, fmtSec, skillLabel, skillPercent, historyRowText };
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `cd app && bun test`
Expected: все PASS

- [ ] **Step 5: Commit**

```bash
git add app/public/report.js app/tests/report.test.js
git commit -m "Add report.js: parent report rendered from real session summary + history

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Пререндер озвучки — `tools/prerender.py`

**Files:**
- Create: `tools/requirements.txt`, `tools/dump-story.js`, `tools/prerender.py`
- Modify: `.gitignore`
- Delete: `spike/prerender.js`, устаревшие `app/public/audio/{fox_*,owl_*,ending}.wav`
- Create: `app/public/audio/<id>.wav` для всех узлов + вариантов

**Interfaces:**
- `tools/dump-story.js` печатает JSON `{ "<audioId>": "<kk text>" }` — включает узлы с `kk`, плюс `tracks_reveal_2..5` и `q_echo_<kkLower>`; исключает `tracks_reveal` и `q_echo` без суффикса (у них нет фиксированного текста).
- `tools/prerender.py [--force] [--only id1,id2]`.

- [ ] **Step 1: Зависимости и gitignore**

`tools/requirements.txt`:
```
piper-tts>=1.2.0
imageio-ffmpeg>=0.5.1
```
В `.gitignore` добавить:
```
tools/voices/
tools/.venv/
```

- [ ] **Step 2: `tools/dump-story.js`**

```js
#!/usr/bin/env node
// Prints { audioId: kazakhText } for every line tools/prerender.py must
// synthesise. story.js is a classic browser script with a module.exports
// tail, so a plain require() works here.
const path = require("path");
const { STORY, trackLines, echoLines, BROTHER_NAMES } = require(path.join(__dirname, "..", "app", "public", "story.js"));

const out = {};
for (const [id, node] of Object.entries(STORY)) {
  if (!node.kk) continue;
  if (id === "tracks_reveal" || id === "q_echo") continue; // dynamic, variants below
  out[id] = node.kk;
}
for (let n = 2; n <= 5; n++) out[`tracks_reveal_${n}`] = trackLines(n).revealKk;
for (const b of BROTHER_NAMES) out[`q_echo_${b.kkLower}`] = echoLines(b).kk;

process.stdout.write(JSON.stringify(out, null, 2));
```

Run: `node tools/dump-story.js | head -5`
Expected: JSON, начинается с `"intro": "Сәлем! Мен — түлкі…`

- [ ] **Step 3: `tools/prerender.py`**

```python
#!/usr/bin/env python3
"""Pre-render every hero line to app/public/audio/<id>.wav.

Same voice settings as app/server.js's live speak(): Piper kk_KZ-issai-high,
speaker 3, then a pitch shift up by 1.4x with the duration restored
(asetrate + atempo) so the cub sounds young without talking faster.

Usage:
  python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
  tools/.venv/bin/python tools/prerender.py [--force] [--only intro,q_tracks]
"""
import argparse, json, os, subprocess, sys, tempfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "app" / "public" / "audio"
VOICES = ROOT / "tools" / "voices"
VOICE_NAME = "kk_KZ-issai-high"
VOICE_URL = f"https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/kk/kk_KZ/issai/high/{VOICE_NAME}"
SPEAKER = 3
PITCH = 1.4


def ensure_voice() -> Path:
    override = os.environ.get("PIPER_VOICE_KK")
    if override:
        return Path(override)
    VOICES.mkdir(parents=True, exist_ok=True)
    onnx = VOICES / f"{VOICE_NAME}.onnx"
    cfg = VOICES / f"{VOICE_NAME}.onnx.json"
    for dst, url in ((onnx, VOICE_URL + ".onnx"), (cfg, VOICE_URL + ".onnx.json")):
        if not dst.exists():
            print(f"downloading {url}")
            urllib.request.urlretrieve(url, dst)
    return onnx


def ffmpeg_bin() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def lines() -> dict:
    res = subprocess.run(["node", str(ROOT / "tools" / "dump-story.js")], check=True, capture_output=True, text=True)
    return json.loads(res.stdout)


def render(audio_id: str, text: str, voice: Path, ffmpeg: str) -> None:
    out = OUT_DIR / f"{audio_id}.wav"
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "raw.wav"
        subprocess.run(
            [sys.executable, "-m", "piper", "-m", str(voice), "-s", str(SPEAKER), "-f", str(raw)],
            input=text.encode("utf-8"), check=True,
        )
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(raw),
             "-af", f"asetrate=22050*{PITCH},aresample=22050,atempo={1 / PITCH}", str(out)],
            check=True,
        )
    print(f"rendered {out.relative_to(ROOT)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-render even if the .wav exists")
    ap.add_argument("--only", help="comma-separated audio ids")
    args = ap.parse_args()

    voice = ensure_voice()
    ffmpeg = ffmpeg_bin()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = lines()
    if args.only:
        keep = set(args.only.split(","))
        wanted = {k: v for k, v in wanted.items() if k in keep}

    for audio_id, text in wanted.items():
        if not args.force and (OUT_DIR / f"{audio_id}.wav").exists():
            print(f"skip {audio_id} (exists)")
            continue
        render(audio_id, text, voice, ffmpeg)

    stale = sorted(p.name for p in OUT_DIR.glob("*.wav") if p.stem not in lines())
    if stale:
        print("stale (not in story):", ", ".join(stale))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Установить и запустить**

Run:
```bash
cd /home/technopark/ertegim && python3 -m venv tools/.venv && tools/.venv/bin/pip install -q -r tools/requirements.txt && tools/.venv/bin/python tools/prerender.py
```
Expected: `downloading …onnx`, затем `rendered app/public/audio/intro.wav` … для всех id из dump (≈30 файлов), в конце `stale (not in story): ending.wav, fox_correct.wav, …`.

Если `python -m piper` не принимает `-s`, заменить на `--speaker`. Если модуль называется иначе — `tools/.venv/bin/piper --help` покажет CLI; использовать бинарь `tools/.venv/bin/piper` вместо `sys.executable -m piper`.

- [ ] **Step 5: Прослушать один файл на sanity (длительность/наличие речи)**

Run: `tools/.venv/bin/python -c "import wave;w=wave.open('app/public/audio/intro.wav');print(w.getnframes()/w.getframerate(),'s',w.getframerate(),'Hz')"`
Expected: ~5–9 с, 22050 Hz.

- [ ] **Step 6: Удалить устаревшее**

```bash
git rm -q spike/prerender.js app/public/audio/fox_intro.wav app/public/audio/fox_question.wav app/public/audio/fox_correct.wav app/public/audio/fox_reask.wav app/public/audio/fox_reveal.wav app/public/audio/owl_intro.wav app/public/audio/owl_question.wav app/public/audio/owl_correct.wav app/public/audio/owl_reask.wav app/public/audio/owl_reveal.wav app/public/audio/ending.wav
```

- [ ] **Step 7: Commit**

```bash
git add tools/requirements.txt tools/dump-story.js tools/prerender.py .gitignore app/public/audio/*.wav
git commit -m "Cross-platform Piper prerender (tools/prerender.py); render all new story lines

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Ручной прогон в браузере + правки

**Files:**
- Возможные правки по итогам: `app/public/app.js`, `app/public/index.html`.

- [ ] **Step 1: Поднять статический сервер (сервер Bun на Linux не стартует — ffmpeg.exe)**

Run (в фоне): `cd app/public && python3 -m http.server 8080`
Открыть `http://localhost:8080/?op=1`. `/api/*` будут 404 — это ожидаемо: STT упадёт в ручной режим, TTS — в `.wav`-фолбэк, classify — в локальный. Это как раз прогон деградации.

- [ ] **Step 2: Сценарий A (река)**

1. «Бастау» → `intro` звучит из `.wav`, авто-переход на `q_tracks`, на сцене N следов (2–5), ночной оверлей.
2. В панели оператора нажать «✅ Верно» → `tracks_ok` → `fork_intro` → `q_fork`.
3. Загрузить любой аудиофайл через «📁» (STT 404 → ручной режим) → нажать «⏭ Advance» → должна выбраться `river` → `owl_meet` (совёнок, синий оверлей) → `cave_arrive` → `cave_fear` → `q_courage`.
4. «🔁 Переспросить» → `courage_reask` → `q_courage` снова; «🔁 Переспросить» ещё раз → `courage_reveal` → `q_echo` (имя братика в тексте).
5. «✅ Верно» → `found` (рассветный оверлей, братик появился справа) → `thanks` → PIN → любой PIN → отчёт: слова «—» (транскриптов не было), точность `2/4`, навыки: санау бірден, жол таңдау бірден, батылдық көмекпен, ұйқас бірден; таймлайн содержит «жолды таңдады: өзен», «інісін тапты»; «Өткен ойындар»: «Бұл — бірінші ойын».

- [ ] **Step 3: Сценарий B (повтор, лес, память)**

Перезагрузить страницу → «Бастау» → должен звучать `intro_again`. На `q_fork` в панели: перед «Advance» нельзя задать маршрут вручную — поэтому проверить лес через локальный классификатор: записать микрофоном «направо» (STT 404 → ручной) — маршрут не определится. Вместо этого в DevTools console: `pendingRoute="forest"; markCorrect("тест")` → `bear_meet` (медведь, зелёный оверлей). Дойти до конца → `thanks_again` → отчёт: «Өткен ойындар» содержит одну строку с предыдущей игрой.

- [ ] **Step 4: Блокировка и лимит**

- В консоли на любом вопросе: `submitAudio(new Blob(["x"]), "clip.webm")` → 404 → ручной режим (ок). Полноценная проверка блокировки требует сервера — отметить в отчёте как «проверено логикой, не e2e».
- Лимит: в консоли `Session.current().startedAt = Date.now() - 9*60*1000;` затем нажать «Далее» на любом narration-узле → переход в `found`.

- [ ] **Step 5: Клавиша `` ` ``**

Открыть `http://localhost:8080/` без `?op=1` — панели нет; нажать `` ` `` — появилась; ещё раз — скрылась. В поле PIN клавиша `` ` `` не переключает панель.

- [ ] **Step 6: Исправить найденное, прогнать `bun test`, закоммитить**

```bash
cd app && bun test && cd .. && git add -A app/public && git commit -m "Fix issues found in manual story walkthrough

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(Только если были правки.)

---

### Task 10: Документация и статус

**Files:**
- Modify: `IDEA.md` — в разделе «Сюжетная механика» заменить абзац `_Статус: зафиксировано как целевая нарративная механика… не реализованы в коде._` на `_Статус: реализовано 2026-09-17 — см. docs/story-script.md (цель/страх/таймер/память), отчёт родителю считается из реальной сессии (app/public/session.js)._`
- Create: `docs/status-report-2026-09-17.md` — короткий (≤40 строк): что сделано в этом этапе, что осталось на «фундамент» (дубликат `public/`, Windows-only `server.js`, README, CI), что проверить с носителем казахского.

- [ ] **Step 1: Внести правки, закоммитить**

```bash
git add IDEA.md docs/status-report-2026-09-17.md
git commit -m "Docs: mark story mechanics as implemented, add 2026-09-17 status report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
