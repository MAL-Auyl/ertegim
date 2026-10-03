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
//   2. Home → therapist: the parent sends the usual JSON export (cabinet →
//      «Отправить логопеду»); the therapist imports it and the sessions are
//      merged into the matching child by `pid` (the therapist-side profile
//      id that travelled inside the link).
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
// the same session. Newest first, capped.
function mergeHistory(mine, theirs, max = HW_HISTORY_MAX) {
  const key = (s) => `${s.date}|${s.activity || "story"}`;
  const seen = new Map();
  for (const s of [...(mine || []), ...(theirs || [])]) {
    if (!s || typeof s !== "object" || typeof s.date !== "string" || Number.isNaN(new Date(s.date).getTime())) continue;
    if (!seen.has(key(s))) seen.set(key(s), s);
  }
  return [...seen.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, max);
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

const Homework = { normalizePlan, encodePlan, decodePlan, planLink, planFromHash, weekStart, weekProgress, mergeHistory, parseBundle, matchProfile, HW_HISTORY_MAX };

if (typeof module !== "undefined") {
  module.exports = { Homework, ...Homework };
}
