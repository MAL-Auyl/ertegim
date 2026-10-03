const { test, expect } = require("bun:test");
const { activityTitle, fmtDuration, seriesFromHistory, trend, lineSVG, exportBundle, SKILL_LABEL, ACTIVITY_TITLES } = require("../public/cabinet.js");

test("activity titles cover every activity the app ships", () => {
  const { ACTIVITIES } = require("../public/story.js");
  for (const id of Object.keys(ACTIVITIES)) expect(ACTIVITY_TITLES[id], id).toBeTruthy();
  expect(activityTitle("zzz")).toBe("zzz");
  expect(activityTitle(undefined)).toBe("—");
});

test("skill labels cover every reported skill", () => {
  const { SKILL_META } = require("../public/report.js");
  for (const k of Object.keys(SKILL_META)) expect(SKILL_LABEL[k], k).toBeTruthy();
});

test("fmtDuration", () => {
  expect(fmtDuration(45)).toBe("45 с");
  expect(fmtDuration(125)).toBe("2 мин 5 с");
  expect(fmtDuration(null)).toBe("—");
});

test("seriesFromHistory: oldest first, ratio + rounded seconds, nulls for empty sessions", () => {
  const h = [
    { date: "2026-10-03T10:00:00Z", activity: "count", questionsTotal: 1, firstTryCorrect: 1, avgResponseSec: 2.26, completed: true },
    { date: "2026-10-01T10:00:00Z", activity: "story", questionsTotal: 4, firstTryCorrect: 2, avgResponseSec: 3.14, completed: true },
    { date: "2026-09-30T10:00:00Z", questionsTotal: 0, firstTryCorrect: 0, avgResponseSec: null, completed: false, blocked: true },
  ];
  const s = seriesFromHistory(h);
  expect(s.map((x) => x.activity)).toEqual(["story", "story", "count"]);
  expect(s.map((x) => x.firstTry)).toEqual([null, 0.5, 1]);
  expect(s.map((x) => x.avgSec)).toEqual([null, 3.1, 2.3]);
  expect(s[0].blocked).toBe(true);
});

test("trend: recent mean minus previous mean, null when too little", () => {
  expect(trend([0.2, 0.3, 0.4, 0.6, 0.7, 0.8])).toBeCloseTo(0.4, 5);
  expect(trend([5, 4, 3, 2.5, 2, 1.5])).toBeCloseTo(-2, 5);
  expect(trend([0.5])).toBeNull();
  expect(trend([0.5, null, 0.6])).toBeNull(); // 2 values: nothing "before"
  expect(trend([0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0, 5);
});

test("lineSVG: one path, a marker per live point, a direct label on the last", () => {
  const svg = lineSVG([{ v: 0.5, label: "a" }, { v: null, label: "b" }, { v: 1, label: "c" }], { fmt: (v) => `${v * 100} %` });
  expect(svg).toContain("<path d=\"M");
  expect((svg.match(/<circle/g) || []).length).toBe(2);
  expect(svg).toContain("100 %</text>");
  expect(svg).toContain("<title>c: 100 %</title>");
  expect(lineSVG([{ v: null, label: "x" }])).toContain("нет данных");
  // untrusted labels are escaped
  expect(lineSVG([{ v: 1, label: "<b>" }])).not.toContain("<b>");
});

test("exportBundle carries the child, sessions and stickers", () => {
  const b = exportBundle({ id: "p1", name: "Айгерим", age: 5, notes: "", settings: { gentle: true }, createdAt: "x" }, [{ date: "d" }], { fox: "t" });
  expect(b.child.name).toBe("Айгерим");
  expect(b.sessions.length).toBe(1);
  expect(b.stickers.fox).toBe("t");
  expect(b.app).toBe("Ертегім");
});
