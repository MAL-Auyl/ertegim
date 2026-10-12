// Homework between the therapist's cabinet and the child's home device.
//
// The app keeps everything in the browser of ONE device, so the therapist's
// tablet and the parents' phone never share storage. This module is the
// bridge, without a server and without accounts:
//
//   1. Therapist → home: the cabinet packs the plan (which activities, how
//      many times a week, a note) into the HASH of a link — /#hw=<base64url>.
//      The hash never reaches a server; the parent opens the link, the home
//      screen shows the plan and stores it in the child's profile.
//   2. Home → therapist: one button on the parents' home screen
//      («Нәтижені жіберу») sends a RESULTS link — /cabinet.html#hwr=<…> —
//      with the sessions played since the plan was issued (the numbers the
//      cabinet needs: answers per skill, first try, hints, words; no
//      attempt transcripts). The therapist opens it on the cabinet's device
//      and the sessions are merged into the matching child by `pid` (the
//      therapist-side profile id that travelled inside the plan link). The
//      full JSON export (cabinet → «Отправить логопеду») still works and
//      also carries transcripts when the parents agreed to keep them.
//
// Pure data, no DOM: classic <script> on pages, require()'d by
// tests/homework.test.js.

const HW_VERSION = 1;
const HW_HASH = "hw";
const HW_NOTE_MAX = 300;
const HW_HISTORY_MAX = 100;

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// A plan as stored and shared. `known` (activity ids the app ships) drops
// anything a newer/older app version would not understand.
function normalizePlan(p, known = null) {
  if (!p || typeof p !== "object") return null;
  const acts = Array.isArray(p.activities) ? p.activities.filter((x) => typeof x === "string" && (!known || known.includes(x))) : [];
  const uniq = [...new Set(acts)].slice(0, 10);
  if (!uniq.length) return null;
  const perWeek = Number.isInteger(p.perWeek) && p.perWeek >= 1 && p.perWeek <= 7 ? p.perWeek : 3;
  const created = new Date(p.createdAt);
  return {
    v: HW_VERSION,
    activities: uniq,
    perWeek,
    note: String(p.note || "").slice(0, HW_NOTE_MAX),
    from: String(p.from || "").trim().slice(0, 60),
    child: String(p.child || "").trim().slice(0, 40),
    pid: typeof p.pid === "string" ? p.pid.slice(0, 40) : null,
    createdAt: Number.isNaN(created.getTime()) ? new Date(0).toISOString() : created.toISOString(),
  };
}

function encodePlan(plan) {
  const p = normalizePlan(plan);
  return p ? b64urlEncode(JSON.stringify(p)) : null;
}

function decodePlan(code, known = null) {
  try {
    return normalizePlan(JSON.parse(b64urlDecode(String(code || ""))), known);
  } catch {
    return null;
  }
}

function planLink(origin, plan) {
  const code = encodePlan(plan);
  return code ? `${String(origin).replace(/\/$/, "")}/#${HW_HASH}=${code}` : null;
}

// "#hw=..." (or a full URL with it) → the plan, else null.
function planFromHash(hash, known = null) {
  const m = /[#&]hw=([A-Za-z0-9_-]+)/.exec(String(hash || ""));
  return m ? decodePlan(m[1], known) : null;
}

// Monday 00:00 local time of the week `now` falls in.
function weekStart(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

// Completed sessions this week per planned activity.
function weekProgress(plan, history, now = Date.now()) {
  if (!plan) return [];
  const from = weekStart(now);
  return plan.activities.map((id) => {
    const done = (history || []).filter((h) => h && h.completed && (h.activity || "story") === id && new Date(h.date).getTime() >= from && new Date(h.date).getTime() <= now).length;
    return { id, done, target: plan.perWeek, met: done >= plan.perWeek };
  });
}

// Sessions from another device merged into ours: same date + activity is
// the same session. When both copies exist the fuller one wins — the JSON
// export (with attempt transcripts) over a results link's short copy.
// Newest first, capped.
function mergeHistory(mine, theirs, max = HW_HISTORY_MAX) {
  const key = (s) => `${s.date}|${s.activity || "story"}`;
  const rank = (s) => (Array.isArray(s.attempts) ? 2 : 0) + (s.fromLink ? 0 : 1);
  const seen = new Map();
  for (const s of [...(mine || []), ...(theirs || [])]) {
    if (!s || typeof s !== "object" || typeof s.date !== "string" || Number.isNaN(new Date(s.date).getTime())) continue;
    const k = key(s);
    if (!seen.has(k) || rank(s) > rank(seen.get(k))) seen.set(k, s);
  }
  return [...seen.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, max);
}

// ---- results link (home → therapist) ----------------------------------
const HW_RESULTS_HASH = "hwr";
const HW_RESULTS_MAX = 30; // sessions in one link (newest)
const HW_WORDS_MAX = 8; // words per session in the link
const HW_STATE_CODE = { first: "f", reask: "r", reveal: "v" };
const HW_STATE_NAME = { f: "first", r: "reask", v: "reveal" };

// One session → short keys. Skipped skills and the per-attempt detail stay
// home; the cabinet's dynamics, skill map and homework progress need only
// these.
function packSession(s) {
  const k = {};
  for (const [skill, st] of Object.entries(s.skills || {})) if (HW_STATE_CODE[st]) k[skill] = HW_STATE_CODE[st];
  const o = { d: s.date, a: s.activity || "story", k }; // first-try counts are recomputed from k
  if (s.completed) o.c = 1;
  if (s.blocked) o.b = 1;
  if (Number.isFinite(s.durationSec)) o.u = s.durationSec;
  if (Number.isFinite(s.avgResponseSec)) o.t = Math.round(s.avgResponseSec * 10) / 10;
  if (s.gestureAnswers) o.g = s.gestureAnswers;
  if (s.adultAnswers) o.j = s.adultAnswers;
  if (s.visualHints) o.h = s.visualHints;
  if (s.route) o.r = String(s.route).slice(0, 20);
  const w = (Array.isArray(s.words) ? s.words : []).filter((x) => typeof x === "string").slice(0, HW_WORDS_MAX).map((x) => x.slice(0, 24));
  if (w.length) o.w = w;
  return o;
}

function unpackSession(o) {
  if (!o || typeof o !== "object" || typeof o.d !== "string" || Number.isNaN(new Date(o.d).getTime())) return null;
  const skills = {};
  for (const [skill, c] of Object.entries(o.k && typeof o.k === "object" ? o.k : {})) {
    if (HW_STATE_NAME[c] && /^[a-z][a-z0-9_]{0,30}$/.test(skill)) skills[skill] = HW_STATE_NAME[c];
  }
  const int = (x) => (Number.isInteger(x) && x >= 0 && x < 1000 ? x : 0);
  const q = Object.keys(skills).length;
  return {
    date: new Date(o.d).toISOString(),
    activity: typeof o.a === "string" ? o.a.slice(0, 40) : "story",
    durationSec: Number.isFinite(o.u) && o.u >= 0 ? Math.round(o.u) : null,
    route: typeof o.r === "string" ? o.r : null,
    completed: o.c === 1,
    blocked: o.b === 1,
    words: Array.isArray(o.w) ? o.w.filter((x) => typeof x === "string").slice(0, HW_WORDS_MAX).map((x) => x.slice(0, 24)) : [],
    avgResponseSec: Number.isFinite(o.t) && o.t >= 0 ? o.t : null,
    // recomputed from the skills, so a hand-edited link cannot claim more
    firstTryCorrect: Object.values(skills).filter((x) => x === "first").length,
    questionsTotal: q,
    gestureAnswers: int(o.g),
    adultAnswers: int(o.j),
    visualHints: int(o.h),
    skills,
    moments: [],
    fromLink: true,
  };
}

// Sessions played since the plan was issued, newest first, capped.
function sessionsSince(plan, history) {
  const from = plan ? new Date(plan.createdAt).getTime() : 0;
  return (history || []).filter((s) => s && typeof s.date === "string" && new Date(s.date).getTime() >= from);
}

// What the parents' button sends. `profile` is the home-side child.
function resultsPayload(profile, plan, history, now = Date.now()) {
  const sessions = sessionsSince(plan, history).slice(0, HW_RESULTS_MAX);
  return {
    v: HW_VERSION,
    c: { id: profile.id, l: profile.linkedId || (plan && plan.pid) || null, n: String(profile.name || "").slice(0, 40) },
    r: plan ? plan.createdAt : null,
    at: new Date(now).toISOString(),
    s: sessions.map(packSession),
  };
}

function resultsLink(origin, payload) {
  return `${String(origin).replace(/\/$/, "")}/cabinet.html#${HW_RESULTS_HASH}=${b64urlEncode(JSON.stringify(payload))}`;
}

// "#hwr=…" (or a whole pasted link / WhatsApp message with it) → { child,
// round, sentAt, sessions } shaped like parseBundle() output, else null.
function resultsFromHash(text) {
  const m = /[#&]hwr=([A-Za-z0-9_-]+)/.exec(String(text || ""));
  if (!m) return null;
  try {
    const o = JSON.parse(b64urlDecode(m[1]));
    if (!o || typeof o !== "object" || !o.c || !Array.isArray(o.s)) return null;
    const str = (x, n) => (typeof x === "string" ? x.slice(0, n) : null);
    const date = (x) => (typeof x === "string" && !Number.isNaN(new Date(x).getTime()) ? new Date(x).toISOString() : null);
    return {
      child: { id: str(o.c.id, 40), linkedId: str(o.c.l, 40), name: str(o.c.n, 40) || "" },
      round: date(o.r),
      sentAt: date(o.at),
      sessions: mergeHistory([], o.s.slice(0, HW_RESULTS_MAX).map(unpackSession)),
      stickers: {},
    };
  } catch {
    return null;
  }
}

// Validates a JSON export from the cabinet. Returns { child, sessions,
// stickers } or null.
function parseBundle(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== "Ертегім" || !obj.child || !Array.isArray(obj.sessions)) return null;
  return {
    child: {
      id: typeof obj.child.id === "string" ? obj.child.id : null,
      linkedId: typeof obj.child.linkedId === "string" ? obj.child.linkedId : null,
      name: String(obj.child.name || "").slice(0, 40),
    },
    sessions: mergeHistory([], obj.sessions),
    stickers: obj.stickers && typeof obj.stickers === "object" && !Array.isArray(obj.stickers) ? obj.stickers : {},
  };
}

// Which local profile an imported bundle belongs to: the one the link was
// made for (linkedId = our id), then one linked to the same remote child,
// then by name. null → create a new profile.
function matchProfile(profiles, child) {
  if (!child) return null;
  return (child.linkedId && profiles.find((p) => p.id === child.linkedId))
    || (child.id && profiles.find((p) => p.linkedId === child.id || p.remoteId === child.id))
    || (child.name && profiles.find((p) => p.name.trim().toLowerCase() === child.name.trim().toLowerCase()))
    || null;
}

const Homework = { normalizePlan, encodePlan, decodePlan, planLink, planFromHash, weekStart, weekProgress, mergeHistory, parseBundle, matchProfile, sessionsSince, packSession, unpackSession, resultsPayload, resultsLink, resultsFromHash, HW_HISTORY_MAX, HW_RESULTS_MAX };

if (typeof module !== "undefined") {
  module.exports = { Homework, ...Homework };
}
