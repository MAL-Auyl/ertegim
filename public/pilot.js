// Pilot report: one anonymised summary of every child on this device —
// for the pilot's results and a grant application (pilot-report.html,
// a button in the cabinet).
//
// Anonymised by construction: a child is a code (Р1, Р2 … in order of the
// first session), an age group and numbers. No names, notes, transcripts,
// words, or session dates leave this module — only the months the pilot
// covered. Several therapists' reports merge into one (mergeReports): the
// totals are recomputed from per-child rows and summed counts, never
// averaged averages.
//
// «Before → after» per child: the share of questions answered on the first
// try in the first N measured sessions vs the last N (N = min(3, half of
// them)), so one good or bad day does not decide it. A child with fewer
// than 2 measured sessions has no before/after.
//
// Pure data, no DOM: classic <script> on the page, require()'d by
// tests/pilot.test.js.

const PILOT_IMPROVED_PP = 5; // "improved" = first-try share up by more than 5 percentage points

function ageGroup(age) {
  if (!Number.isFinite(age)) return "—";
  if (age <= 4) return "3–4";
  if (age <= 6) return "5–6";
  return "7+";
}

function mean(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10); // 0.4567 → 45.7

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  return `${y}-${Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)}`;
}

// One child's row. `history` is newest first, as session.js stores it.
function childRow(code, age, history) {
  const h = [...(history || [])].filter((s) => s && typeof s.date === "string").reverse(); // oldest first
  const measured = h.filter((s) => s.questionsTotal > 0);
  const n = Math.min(3, Math.floor(measured.length / 2));
  const share = (s) => s.firstTryCorrect / s.questionsTotal;
  const before = n ? mean(measured.slice(0, n).map(share)) : null;
  const after = n ? mean(measured.slice(-n).map(share)) : null;
  const rt = h.filter((s) => s.avgResponseSec != null);
  const k = Math.min(3, Math.floor(rt.length / 2));
  const answered = h.reduce((a, s) => a + (s.questionsTotal || 0), 0);
  const weeks = new Set(h.map((s) => isoWeek(new Date(s.date)))).size;
  return {
    code, ageGroup: ageGroup(age),
    sessions: h.length,
    completed: h.filter((s) => s.completed).length,
    weeksActive: weeks,
    perWeek: weeks ? round1(h.length / weeks) : null,
    firstTryBefore: pct(before),
    firstTryAfter: pct(after),
    changePp: before == null ? null : round1((after - before) * 100),
    reactionBefore: k ? round1(mean(rt.slice(0, k).map((s) => s.avgResponseSec))) : null,
    reactionAfter: k ? round1(mean(rt.slice(-k).map((s) => s.avgResponseSec))) : null,
    questions: answered,
    gestureAnswers: h.reduce((a, s) => a + (s.gestureAnswers || 0), 0),
    adultAnswers: h.reduce((a, s) => a + (s.adultAnswers || 0), 0),
    activities: new Set(h.map((s) => s.activity || "story")).size,
  };
}

// Per skill: in how many sessions it was asked, and how it went.
function skillCounts(histories) {
  const out = {};
  for (const h of histories) {
    for (const s of h || []) {
      for (const [skill, st] of Object.entries(s.skills || {})) {
        if (st === "skipped") continue;
        const c = out[skill] || (out[skill] = { asked: 0, first: 0, reask: 0, reveal: 0 });
        c.asked++;
        if (c[st] != null) c[st]++;
      }
    }
  }
  return out;
}

function activityCounts(histories) {
  const out = {};
  for (const h of histories) for (const s of h || []) {
    const id = s.activity || "story";
    out[id] = (out[id] || 0) + 1;
  }
  return out;
}

function monthsOf(histories) {
  const dates = histories.flat().map((s) => s && s.date).filter(Boolean).sort();
  if (!dates.length) return null;
  const m = (iso) => iso.slice(0, 7); // YYYY-MM
  return { from: m(dates[0]), to: m(dates[dates.length - 1]) };
}

// Headline numbers, recomputed from rows + counts (so merged reports are exact).
function aggregate(rows, skills) {
  const active = rows.filter((r) => r.sessions > 0);
  const measured = active.filter((r) => r.changePp != null);
  const reaction = active.filter((r) => r.reactionBefore != null && r.reactionAfter != null);
  const questions = active.reduce((a, r) => a + r.questions, 0);
  const asked = Object.values(skills).reduce((a, c) => a + c.asked, 0);
  const first = Object.values(skills).reduce((a, c) => a + c.first, 0);
  return {
    children: active.length,
    sessions: active.reduce((a, r) => a + r.sessions, 0),
    completedShare: pct(active.length ? active.reduce((a, r) => a + r.completed, 0) / Math.max(1, active.reduce((a, r) => a + r.sessions, 0)) : null),
    medianSessions: median(active.map((r) => r.sessions)),
    medianPerWeek: median(active.map((r) => r.perWeek).filter((x) => x != null)),
    measuredChildren: measured.length,
    improvedChildren: measured.filter((r) => r.changePp > PILOT_IMPROVED_PP).length,
    medianChangePp: round1(median(measured.map((r) => r.changePp))),
    medianReactionChangeSec: round1(median(reaction.map((r) => r.reactionAfter - r.reactionBefore))),
    firstTryOverall: pct(asked ? first / asked : null),
    gestureShare: pct(questions ? active.reduce((a, r) => a + r.gestureAnswers, 0) / questions : null),
    adultShare: pct(questions ? active.reduce((a, r) => a + r.adultAnswers, 0) / questions : null),
  };
}

// `children`: [{ age, history }] in any order (names are never passed in).
// Codes follow the first session, so they reveal nothing about the roster.
function pilotReport(children, { source = "", now = Date.now() } = {}) {
  const withFirst = (children || []).map((c) => {
    const h = Array.isArray(c.history) ? c.history : [];
    const first = h.length ? h[h.length - 1].date : "9999";
    return { ...c, history: h, first };
  }).sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
  const prefix = source ? `${source}-` : "";
  const rows = withFirst.map((c, i) => childRow(`${prefix}Р${i + 1}`, c.age, c.history));
  const histories = withFirst.map((c) => c.history);
  const skills = skillCounts(histories);
  return {
    app: "Ертегім", kind: "pilot-report", v: 1,
    generatedAt: new Date(now).toISOString().slice(0, 10),
    sources: [source || "device"],
    months: monthsOf(histories),
    rows, skills, activities: activityCounts(histories),
    totals: aggregate(rows, skills),
  };
}

// Several therapists' reports → one. Codes get the source letter so rows
// stay unique (Л1-Р3); counts are summed; totals recomputed.
function mergeReports(reports) {
  const valid = (reports || []).filter((r) => r && r.app === "Ертегім" && r.kind === "pilot-report" && Array.isArray(r.rows));
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  const rows = [], skills = {}, activities = {}, months = [];
  valid.forEach((r, i) => {
    const tag = `Л${i + 1}`;
    for (const row of r.rows) rows.push({ ...row, code: `${tag}-${String(row.code).split("-").pop()}` });
    for (const [k, c] of Object.entries(r.skills || {})) {
      const t = skills[k] || (skills[k] = { asked: 0, first: 0, reask: 0, reveal: 0 });
      for (const f of ["asked", "first", "reask", "reveal"]) t[f] += c[f] || 0;
    }
    for (const [k, n] of Object.entries(r.activities || {})) activities[k] = (activities[k] || 0) + n;
    if (r.months) months.push(r.months.from, r.months.to);
  });
  months.sort();
  return {
    app: "Ертегім", kind: "pilot-report", v: 1,
    generatedAt: valid.map((r) => r.generatedAt).sort().pop(),
    sources: valid.map((r, i) => `Л${i + 1}`),
    months: months.length ? { from: months[0], to: months[months.length - 1] } : null,
    rows, skills, activities,
    totals: aggregate(rows, skills),
  };
}

const CSV_COLUMNS = [
  ["code", "Код"], ["ageGroup", "Возраст"], ["sessions", "Занятий"], ["completed", "До конца"],
  ["weeksActive", "Недель"], ["perWeek", "В неделю"], ["firstTryBefore", "С 1-го раза: было, %"],
  ["firstTryAfter", "С 1-го раза: стало, %"], ["changePp", "Изменение, п.п."],
  ["reactionBefore", "Реакция: было, с"], ["reactionAfter", "Реакция: стало, с"],
  ["questions", "Вопросов"], ["gestureAnswers", "Ответов жестом"], ["adultAnswers", "Оценил взрослый"],
  ["activities", "Разных занятий"],
];

function toCsv(report) {
  // Decimal comma: the file is for a Russian/Kazakh-locale spreadsheet.
  const cell = (v) => {
    const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; // «;» separates, so «,» needs no quotes
  };
  const lines = [CSV_COLUMNS.map(([, h]) => cell(h)).join(";")];
  for (const r of report.rows) lines.push(CSV_COLUMNS.map(([k]) => cell(r[k])).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM + ; — opens right in Excel with a Russian locale
}

const Pilot = { pilotReport, mergeReports, aggregate, childRow, toCsv, ageGroup, PILOT_IMPROVED_PP, CSV_COLUMNS };

if (typeof module !== "undefined") {
  module.exports = { Pilot, ...Pilot, skillCounts, activityCounts, median };
}
