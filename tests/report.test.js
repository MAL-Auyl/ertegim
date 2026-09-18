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
