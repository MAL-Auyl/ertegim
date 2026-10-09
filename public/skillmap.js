// Speech-skill map: every question in Ертегім trains one of seven areas
// (sounds, words, understanding, counting, dialogue, breath & hearing,
// letters). The cabinet shows, per area, how the child's answers went over
// all sessions; the parent report shows which areas today's session touched.
//
// This is a map of exercises done and observations made — NOT a diagnosis
// of a speech disorder. The wording everywhere says what happened ("чаще
// отвечает сразу"), never what the child "has".
//
// An area the child has not trained for a while, or mostly answers with
// help, gets suggestions: activities that have questions in that area,
// the ones played least recently first — one tap adds them to homework.
//
// Tale skills carry their area in story.js (TALES[...].skills[k].area), so
// a new tale lands on the map by itself; the built-in activities' skills
// are listed below. Pure data, no DOM: classic <script> on cabinet.html and
// story.html (after story.js), require()'d by tests/skillmap.test.js.

const SKILL_AREAS = [
  { id: "sounds", icon: "🔤", kk: "Дыбыстар", ru: "Звуки" },
  { id: "words", icon: "🗣️", kk: "Сөздер", ru: "Слова" },
  { id: "understanding", icon: "👆", kk: "Түсіну", ru: "Понимание" },
  { id: "counting", icon: "🔢", kk: "Санау", ru: "Счёт" },
  { id: "dialogue", icon: "💬", kk: "Сөйлесу", ru: "Диалог" },
  { id: "breath", icon: "🌬️", kk: "Тыныс және есту", ru: "Дыхание и слух" },
  { id: "letters", icon: "✏️", kk: "Әріптер", ru: "Буквы и письмо" },
];

// Skills of the fox tale and the lessons (story.js ACTIVITIES).
const BUILTIN_SKILL_AREA = {
  count: "counting", plus: "counting", minus: "counting",
  choice: "understanding", empathy: "dialogue", rhyme: "breath",
  sound_a: "sounds", sound_o: "sounds", sound_u: "sounds",
  word_a: "words", word_o: "words", word_u: "words",
  pick_a: "understanding", pick_o: "understanding", pick_u: "understanding",
  open_a: "dialogue", open_o: "dialogue", open_u: "dialogue",
  letter: "letters", write: "letters",
};

const SKILLMAP_STALE_DAYS = 7; // "давно не практиковали"
const SKILLMAP_MIN_ANSWERS = 3; // fewer answers → no conclusion about the area
const SKILLMAP_MAX_SUGGEST = 3;

const SKILLMAP_DATA = typeof ACTIVITIES !== "undefined"
  ? { activities: ACTIVITIES, tales: typeof TALES !== "undefined" ? TALES : {} }
  : (typeof require === "function" ? (() => { const s = require("./story.js"); return { activities: s.ACTIVITIES, tales: s.TALES }; })() : { activities: {}, tales: {} });

function skillAreaIndex(tales = SKILLMAP_DATA.tales) {
  const out = { ...BUILTIN_SKILL_AREA };
  for (const t of Object.values(tales || {})) {
    for (const [k, v] of Object.entries(t.skills || {})) if (v && v.area) out[k] = v.area;
  }
  return out;
}

const SKILL_AREA_OF = skillAreaIndex();

function skillAreaOf(skill) {
  return SKILL_AREA_OF[skill] || null;
}

// The areas one session touched (skills that were actually asked), in
// SKILL_AREAS order — the parent report's «бүгін» chips.
function sessionAreas(summary) {
  const hit = new Set();
  for (const [k, st] of Object.entries((summary && summary.skills) || {})) {
    if (st && st !== "skipped" && skillAreaOf(k)) hit.add(skillAreaOf(k));
  }
  return SKILL_AREAS.filter((a) => hit.has(a.id));
}

// Activities with questions in `area`, never-played / least recently played
// first (ties keep ACTIVITIES order). `history` is newest first.
function areaSuggestions(area, history, activities = SKILLMAP_DATA.activities, max = SKILLMAP_MAX_SUGGEST) {
  const lastPlayed = {};
  for (const s of history || []) {
    if (!s || typeof s.date !== "string") continue;
    const id = s.activity || "story";
    if (!(id in lastPlayed)) lastPlayed[id] = s.date;
  }
  return Object.values(activities || {})
    .map((a, i) => ({ id: a.id, i, n: (a.skills || []).filter((k) => skillAreaOf(k) === area).length, last: lastPlayed[a.id] || "" }))
    .filter((x) => x.n > 0)
    .sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : a.i - b.i))
    .slice(0, max)
    .map((x) => x.id);
}

// One card per area. `history` is newest first (Session.history()).
//   sessions — sessions where the area was asked; asked/first/reask/reveal —
//   answers; firstShare — share answered first try (0..1, null if none);
//   daysSince — days since the area was last practised; trend — last 3
//   sessions vs the 3 before ("up" | "down" | "flat" | null); note — one
//   neutral observation; attention — why to look at it: "new" (never
//   practised), "stale" (not for SKILLMAP_STALE_DAYS), "help" (mostly with
//   a hint), null when fine;
//   suggest — activity ids to add to homework when it needs attention.
function skillMap(history, { now = Date.now(), activities = SKILLMAP_DATA.activities } = {}) {
  const h = Array.isArray(history) ? history : [];
  const acc = {};
  for (const a of SKILL_AREAS) acc[a.id] = { asked: 0, first: 0, reask: 0, reveal: 0, sessions: 0, last: null, shares: [] };
  for (const s of [...h].reverse()) { // oldest first, so `shares` is chronological
    const per = {};
    for (const [k, st] of Object.entries((s && s.skills) || {})) {
      const area = skillAreaOf(k);
      if (!area || !acc[area] || !st || st === "skipped") continue;
      const p = per[area] || (per[area] = { asked: 0, first: 0 });
      p.asked++;
      if (st === "first") p.first++;
      const c = acc[area];
      c.asked++;
      if (c[st] != null) c[st]++;
    }
    for (const [area, p] of Object.entries(per)) {
      const c = acc[area];
      c.sessions++;
      c.shares.push(p.first / p.asked);
      const t = new Date(s.date).getTime();
      if (!Number.isNaN(t)) c.last = t;
    }
  }
  return SKILL_AREAS.map((a) => {
    const c = acc[a.id];
    const firstShare = c.asked ? c.first / c.asked : null;
    const daysSince = c.last == null ? null : Math.max(0, Math.floor((now - c.last) / 86400000));
    const recent = c.shares.slice(-3), before = c.shares.slice(-6, -3);
    const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
    const d = before.length && c.shares.length >= 4 ? mean(recent) - mean(before) : null;
    let note;
    if (!c.asked) note = "ещё не практиковали";
    else if (c.asked < SKILLMAP_MIN_ANSWERS) note = "пока мало ответов для выводов";
    else if (firstShare >= 0.8) note = "чаще всего отвечает сразу";
    else if (firstShare >= 0.5) note = "больше половины ответов — сразу";
    else note = "чаще нужна подсказка";
    let attention = null;
    if (!c.asked) attention = "new";
    else if (daysSince != null && daysSince >= SKILLMAP_STALE_DAYS) attention = "stale";
    else if (c.asked >= SKILLMAP_MIN_ANSWERS && firstShare < 0.5) attention = "help";
    return {
      ...a,
      sessions: c.sessions, asked: c.asked, first: c.first, reask: c.reask, reveal: c.reveal,
      firstShare, daysSince,
      trend: d == null ? null : d > 0.15 ? "up" : d < -0.15 ? "down" : "flat",
      note, attention,
      suggest: attention ? areaSuggestions(a.id, h, activities) : [],
    };
  });
}

const SkillMap = { SKILL_AREAS, BUILTIN_SKILL_AREA, skillAreaIndex, skillAreaOf, sessionAreas, areaSuggestions, skillMap, SKILLMAP_STALE_DAYS, SKILLMAP_MIN_ANSWERS };

if (typeof module !== "undefined") {
  module.exports = { SkillMap, ...SkillMap };
}
