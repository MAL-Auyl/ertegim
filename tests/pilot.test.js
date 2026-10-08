const { test, expect, describe } = require("bun:test");
const P = require("../public/pilot.js");

// history is newest first, like session.js stores it
const sess = (day, ft, total = 4, extra = {}) => ({
  date: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`, activity: "letter-a",
  questionsTotal: total, firstTryCorrect: ft, completed: true, avgResponseSec: 4 - day / 10,
  skills: { sound_a: ft >= 2 ? "first" : "reask", word_a: "first", pick_a: "skipped" },
  gestureAnswers: 1, adultAnswers: 0, words: ["алма", "секрет"], moments: [{ text_kk: "x" }],
  attempts: [{ transcript: "менің атым Айгерім" }], ...extra,
});
const histA = [8, 7, 6, 5, 4, 3].map((d, i) => sess(d, [4, 4, 3, 2, 1, 1][i]));      // improving
const histB = [12, 11].map((d) => sess(d, 2, 4, { activity: "bear-honey", completed: d === 12 })); // 2 sessions, flat
const children = [
  { age: 6, history: histB, name: "Бекзат", notes: "ЗРР" },
  { age: 4, history: histA, name: "Айгерім", notes: "алалия" },
  { age: null, history: [] },
];

describe("pilot report for one device", () => {
  const r = P.pilotReport(children, { now: Date.UTC(2026, 9, 20) });

  test("anonymised: codes by first session, age groups, no names, notes, words, transcripts or dates", () => {
    expect(r.rows.map((x) => x.code)).toEqual(["Р1", "Р2", "Р3"]);
    expect(r.rows.map((x) => x.ageGroup)).toEqual(["3–4", "5–6", "—"]);
    const json = JSON.stringify(r);
    for (const secret of ["Бекзат", "Айгерім", "ЗРР", "алалия", "алма", "секрет", "менің атым", "2026-10-03", "T10:00"]) {
      expect(json.includes(secret), secret).toBe(false);
    }
    expect(r.months).toEqual({ from: "2026-10", to: "2026-10" });
  });

  test("before → after uses the first and last N measured sessions", () => {
    const a = r.rows[0]; // oldest-first shares: .25 .25 .5 .75 1 1 → first 3 vs last 3
    expect(a.sessions).toBe(6);
    expect(a.firstTryBefore).toBeCloseTo(33.3, 1);
    expect(a.firstTryAfter).toBeCloseTo(91.7, 1);
    expect(a.changePp).toBeCloseTo(58.3, 1);
    expect(a.reactionAfter).toBeLessThan(a.reactionBefore);
    const b = r.rows[1]; // 2 sessions → N = 1
    expect(b.firstTryBefore).toBe(50);
    expect(b.changePp).toBe(0);
    expect(r.rows[2]).toMatchObject({ sessions: 0, firstTryBefore: null, changePp: null });
  });

  test("totals", () => {
    expect(r.totals).toMatchObject({
      children: 2, sessions: 8, measuredChildren: 2, improvedChildren: 1,
      medianSessions: 4,
    });
    expect(r.totals.completedShare).toBe(87.5); // 7 of 8
    expect(r.totals.gestureShare).toBeCloseTo((8 / 32) * 100, 1);
    expect(r.activities).toEqual({ "letter-a": 6, "bear-honey": 2 });
    expect(r.skills.sound_a.asked).toBe(8);
    expect(r.skills.pick_a).toBeUndefined(); // skipped skills are not counted
  });

  test("CSV: one row per child, Excel-friendly", () => {
    const csv = P.toCsv(r);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBe(4);
    expect(lines[0].split(";").length).toBe(P.CSV_COLUMNS.length);
    expect(lines[1].startsWith("Р1;3–4;6;")).toBe(true);
    expect(lines[1]).toContain(";33,3;"); // decimal comma for a Russian-locale Excel
  });
});

describe("merging several therapists' reports", () => {
  test("rows are re-coded per source, counts summed, totals recomputed exactly", () => {
    const r1 = P.pilotReport([{ age: 4, history: histA }]);
    const r2 = P.pilotReport([{ age: 6, history: histB }]);
    const m = P.mergeReports([JSON.parse(JSON.stringify(r1)), r2, { app: "other" }]);
    expect(m.rows.map((x) => x.code)).toEqual(["Л1-Р1", "Л2-Р1"]);
    expect(m.sources).toEqual(["Л1", "Л2"]);
    expect(m.totals.sessions).toBe(8);
    expect(m.skills.sound_a.asked).toBe(8);
    const together = P.pilotReport([{ age: 4, history: histA }, { age: 6, history: histB }]);
    expect(m.totals).toEqual(together.totals);
    expect(P.mergeReports([r1])).toBe(r1);
    expect(P.mergeReports([{ app: "x" }])).toBeNull();
  });
});
