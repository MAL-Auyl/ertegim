// Adventure map («Шытырман жол») and the treasure chest («Қазына сандығы»).
//
// Why: a good tale library still goes stale if nothing pulls the child back
// tomorrow. Two pulls, both gentle:
//   • the path — tales open one by one: finishing a tale opens the next
//     stop, so there is always "the next one" waiting;
//   • the chest — the FIRST finished activity of each day (any tale or
//     lesson) opens the chest and adds one treasure to the collection; 3 and
//     7 days in a row add a bonus one. Missing a day only resets the streak,
//     nothing is ever taken away.
//
// A lock must never stand between a child and a session the therapist
// chose: activities assigned as homework are always open, and the cabinet
// can open the whole path for a child (settings.unlockAll).
//
// Progress lives in its own per-child key, not in the session history:
// the history is capped (session.js HISTORY_MAX), and a tale finished 101
// sessions ago must not lock again. A child who played before the map
// existed is seeded from the history once.
//
// Pure functions + a tiny storage wrapper, no DOM: classic <script> on the
// pages, require()'d by tests/adventure.test.js.

const ADVENTURE_KEY = "ertegim.adventure";
const ADVENTURE_DAYS_KEPT = 60;
const STREAK_BONUS_DAYS = [3, 7];

// Kazakh treasures — things a child knows and a culture is proud of.
// Emoji, so every device draws them without extra files.
const TREASURES = {
  tulpar: { icon: "🐎", kk: "Тұлпар", ru: "конь-тулпар" },
  burkit: { icon: "🦅", kk: "Бүркіт", ru: "беркут" },
  qyzgaldaq: { icon: "🌷", kk: "Қызғалдақ", ru: "тюльпан" },
  tuye: { icon: "🐫", kk: "Түйе", ru: "верблюд" },
  altyn: { icon: "🪙", kk: "Алтын теңге", ru: "золотая монетка" },
  gauhar: { icon: "💎", kk: "Гауһар", ru: "алмаз" },
  kempirqosaq: { icon: "🌈", kk: "Кемпірқосақ", ru: "радуга" },
  kobelek: { icon: "🦋", kk: "Көбелек", ru: "бабочка" },
  batpyrauyq: { icon: "🪁", kk: "Батпырауық", ru: "воздушный змей" },
  tau: { icon: "🏔️", kk: "Тау", ru: "гора" },
  ai: { icon: "🌙", kk: "Ай", ru: "луна" },
  kun: { icon: "☀️", kk: "Күн", ru: "солнце" },
  qoyan: { icon: "🐰", kk: "Қоян", ru: "зайчик" },
  balyq: { icon: "🐟", kk: "Балық", ru: "рыбка" },
  jidek: { icon: "🍓", kk: "Жидек", ru: "ягодка" },
  qongyrau: { icon: "🔔", kk: "Қоңырау", ru: "колокольчик" },
};

// The path: the fox tale first, then every tale of story.js TALES in
// registry order — a new tale lands at the end of the path by itself.
function adventurePath(tales) {
  return ["story", ...Object.keys(tales || {})];
}

function localDay(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayIndex(day) {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function emptyState() {
  return { v: 1, done: {}, days: [], treasures: {}, coins: 0, seeded: false };
}

function normalizeState(s) {
  const out = emptyState();
  if (!s || typeof s !== "object") return out;
  if (s.done && typeof s.done === "object") for (const [k, v] of Object.entries(s.done)) if (typeof v === "string") out.done[k] = v;
  if (Array.isArray(s.days)) out.days = [...new Set(s.days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-ADVENTURE_DAYS_KEPT);
  if (s.treasures && typeof s.treasures === "object") for (const [k, v] of Object.entries(s.treasures)) if (TREASURES[k] && typeof v === "string") out.treasures[k] = v;
  out.coins = Number.isInteger(s.coins) && s.coins > 0 ? s.coins : 0;
  out.seeded = s.seeded === true;
  return out;
}

// Days in a row that end today — or yesterday, when today has not been
// played yet (the streak is still alive until the day is over).
function streak(days, now = Date.now()) {
  const set = new Set((days || []).map(dayIndex));
  let d = dayIndex(localDay(now));
  if (!set.has(d)) d -= 1;
  let n = 0;
  while (set.has(d)) { n++; d--; }
  return n;
}

// Each stop: "done", "open" (playable) or "locked"; the first open, not
// yet done stop is the `current` one the map points at.
function stopStatus(path, state, { assigned = [], unlockAll = false } = {}) {
  const st = normalizeState(state);
  const assignedSet = new Set(assigned || []);
  const stops = path.map((id, i) => {
    const done = !!st.done[id];
    const open = done || unlockAll || assignedSet.has(id) || i === 0 || !!st.done[path[i - 1]];
    return { id, status: done ? "done" : open ? "open" : "locked", current: false };
  });
  const cur = stops.find((s) => s.status === "open");
  if (cur) cur.current = true;
  return stops;
}

// Deterministic "random": the same child and day always get the same
// treasure (reloading the end screen cannot reroll it), different days
// different ones.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function pickTreasure(collected, seed) {
  const left = Object.keys(TREASURES).filter((id) => !collected[id]);
  if (!left.length) return null;
  return left[hashString(seed) % left.length];
}

// A finished session. Returns the new state and what to celebrate:
//   newlyDone   — this path stop was finished for the first time;
//   unlocked    — the stop that just opened because of it (or null);
//   chest       — true when this was the day's first finished activity;
//   treasures   — treasure ids earned now (the chest's, plus a streak bonus);
//   coins       — gold coins earned now (once every treasure is collected);
//   streak      — days in a row, today included.
function recordPlay(state, activityId, path, { now = Date.now(), seed = "" } = {}) {
  const st = normalizeState(state);
  const today = localDay(now);
  const result = { newlyDone: false, unlocked: null, chest: false, treasures: [], coins: 0, streak: 0 };

  const i = path.indexOf(activityId);
  if (i >= 0 && !st.done[activityId]) {
    st.done[activityId] = new Date(now).toISOString();
    result.newlyDone = true;
    const next = path[i + 1];
    if (next && !st.done[next]) result.unlocked = next;
  }

  if (!st.days.includes(today)) {
    st.days = [...st.days, today].sort().slice(-ADVENTURE_DAYS_KEPT);
    result.chest = true;
    result.streak = streak(st.days, now);
    const rewards = 1 + (STREAK_BONUS_DAYS.includes(result.streak) ? 1 : 0);
    for (let k = 0; k < rewards; k++) {
      const t = pickTreasure(st.treasures, `${seed}|${today}|${k}`);
      if (t) { st.treasures[t] = new Date(now).toISOString(); result.treasures.push(t); }
      else { st.coins += 1; result.coins += 1; }
    }
  } else {
    result.streak = streak(st.days, now);
  }
  return { state: st, result };
}

// One-time migration for a child who played before the map existed:
// finished path stops and play days come from the session history. No
// treasures are handed out retroactively — the chest starts today.
function seedFromHistory(state, history, path) {
  const st = normalizeState(state);
  if (st.seeded) return st;
  for (const s of history || []) {
    if (!s || !s.completed) continue;
    const id = s.activity || "story";
    if (path.includes(id) && !st.done[id]) st.done[id] = s.date;
  }
  st.seeded = true;
  return st;
}

// --------------------------------------------------------------- storage --
const Adventure = {
  _storage: null,

  storage() {
    try { return this._storage || (typeof localStorage !== "undefined" ? localStorage : null); } catch { return null; }
  },

  key() {
    try {
      return typeof Profiles !== "undefined" && Profiles.scopedKey ? Profiles.scopedKey(ADVENTURE_KEY) : ADVENTURE_KEY;
    } catch {
      return ADVENTURE_KEY;
    }
  },

  path() {
    const tales = typeof TALES !== "undefined" ? TALES : (typeof require === "function" ? require("./story.js").TALES : {});
    return adventurePath(tales);
  },

  load() {
    let raw = null;
    try { const st = this.storage(); raw = st ? JSON.parse(st.getItem(this.key()) || "null") : null; } catch { raw = null; }
    let state = normalizeState(raw);
    if (!state.seeded) {
      const history = typeof Session !== "undefined" && Session.history ? Session.history() : [];
      state = seedFromHistory(state, history, this.path());
      this.save(state);
    }
    return state;
  },

  save(state) {
    try { const st = this.storage(); if (st) st.setItem(this.key(), JSON.stringify(normalizeState(state))); } catch { /* quota / private mode */ }
  },

  stops({ assigned = [], unlockAll = false } = {}) {
    return stopStatus(this.path(), this.load(), { assigned, unlockAll });
  },

  record(activityId, now = Date.now()) {
    const seed = typeof Profiles !== "undefined" && Profiles.active ? Profiles.active().id : "";
    const { state, result } = recordPlay(this.load(), activityId, this.path(), { now, seed });
    this.save(state);
    return result;
  },
};

if (typeof module !== "undefined") {
  module.exports = {
    Adventure, TREASURES, ADVENTURE_KEY, STREAK_BONUS_DAYS,
    adventurePath, localDay, streak, stopStatus, pickTreasure, recordPlay, seedFromHistory, normalizeState,
  };
}
