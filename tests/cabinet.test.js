const { test, expect, describe } = require("bun:test");
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

describe("«Все дети» overview", () => {
  const { childOverview, sortOverview } = require("../public/cabinet.js");
  const DAY = 86400000;
  const now = new Date(2026, 9, 9, 12).getTime(); // Friday
  const s = (daysAgo, ft, total = 4) => ({ date: new Date(now - daysAgo * DAY).toISOString(), questionsTotal: total, firstTryCorrect: ft, completed: true });

  test("recent child doing well: no flags", () => {
    const r = childOverview({ id: "p1", name: "Айгерім", age: 5 }, [s(0, 4), s(1, 3), s(2, 3), s(9, 2)], [{ id: "letter-a", done: 3, target: 3 }], now);
    expect(r.daysSince).toBe(0);
    expect(r.week).toBe(3);
    expect(r.sessions).toBe(4);
    expect(r.firstTry).toBeCloseTo((0.75 + 0.75 + 1) / 3, 5);
    expect(r.homework).toEqual({ done: 3, target: 3 });
    expect(r.flags).toEqual([]);
  });

  test("flags: never played, a week without sessions, homework behind late in the week, falling first-try share", () => {
    expect(childOverview({ id: "a", name: "A" }, [], [], now).flags).toEqual(["ещё не занимался"]);
    expect(childOverview({ id: "b", name: "B" }, [s(8, 2)], [], now).flags).toEqual(["не занимался 8 дн."]);
    expect(childOverview({ id: "c", name: "C" }, [s(0, 4)], [{ id: "x", done: 1, target: 3 }], now).flags).toContain("задание отстаёт");
    const monday = new Date(2026, 9, 5, 12).getTime();
    expect(childOverview({ id: "c", name: "C" }, [{ ...s(0, 4), date: new Date(monday).toISOString() }], [{ id: "x", done: 0, target: 3 }], monday).flags).not.toContain("задание отстаёт");
    const falling = [s(0, 1), s(1, 1), s(2, 1), s(3, 4), s(4, 4), s(5, 4)];
    const r = childOverview({ id: "d", name: "D" }, falling, [], now);
    expect(r.trend).toBe("down");
    expect(r.flags).toContain("ответов с первого раза меньше");
  });

  test("homework counts at most the target per activity", () => {
    const r = childOverview({ id: "e", name: "E" }, [s(0, 4)], [{ id: "a", done: 5, target: 2 }, { id: "b", done: 0, target: 2 }], now);
    expect(r.homework).toEqual({ done: 2, target: 4 });
  });

  test("children needing attention come first, then by name", () => {
    const rows = sortOverview([
      { name: "Бекзат", flags: [] }, { name: "Айгерім", flags: [] }, { name: "Нұрлан", flags: ["x"] },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Нұрлан", "Айгерім", "Бекзат"]);
  });
});
