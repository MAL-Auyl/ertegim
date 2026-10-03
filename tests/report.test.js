const { test, expect } = require("bun:test");
const { fmtSec, skillLabel, skillPercent, skillStars, starsHTML, summaryLine, historyRowText, skillRows, SKILL_META } = require("../public/report.js");

test("stars: 3 first / 2 reask / 1 reveal / 0 skipped, rendered with dimmed remainder", () => {
  expect([skillStars("first"), skillStars("reask"), skillStars("reveal"), skillStars("skipped")]).toEqual([3, 2, 1, 0]);
  expect(starsHTML(3)).toBe("★★★");
  expect(starsHTML(1)).toBe('★<span class="off">★</span><span class="off">★</span>');
  expect(starsHTML(0)).toBe('<span class="off">★</span><span class="off">★</span><span class="off">★</span>');
});

test("summaryLine: the fox's one-sentence headline follows the numbers", () => {
  const base = { words: ["бар", "солға", "мен"], questionsTotal: 4, firstTryCorrect: 2, blocked: false };
  expect(summaryLine(base)).toBe("Мен 3 сөз естідім! 4 сұрақтың 2-іне бірден жауап бердің. Жарайсың!");
  expect(summaryLine({ ...base, firstTryCorrect: 4 })).toContain("Барлық 4 сұраққа бірден");
  expect(summaryLine({ ...base, firstTryCorrect: 0 })).toContain("әр жолы мен көмектестім");
  expect(summaryLine({ ...base, words: [], firstTryCorrect: 1 })).toBe("4 сұрақтың 1-іне бірден жауап бердің. Жарайсың!");
  expect(summaryLine({ ...base, questionsTotal: 0, firstTryCorrect: 0 })).toContain("келесі жолы");
  expect(summaryLine({ ...base, blocked: true })).toContain("ерте аяқталды");
});

test("skillRows lists only the skills this session had, in the session's order", () => {
  const tale = { skills: { count: "first", choice: "reask", empathy: "skipped", rhyme: "reveal" } };
  expect(skillRows(tale).map(([k]) => k)).toEqual(["count", "choice", "empathy", "rhyme"]);
  const lesson = { skills: { sound_a: "first", word_a: "reask", pick_a: "first", open_a: "skipped" } };
  expect(skillRows(lesson).map(([k]) => k)).toEqual(["sound_a", "word_a", "pick_a", "open_a"]);
  expect(skillRows({ skills: { bogus: "first" } })).toEqual([]); // unknown skill → no row, no crash
  for (const [, meta] of skillRows(lesson)) expect(meta.name.length).toBeGreaterThan(0);
  expect(Object.keys(SKILL_META)).toEqual(expect.arrayContaining(["sound_a", "word_a", "pick_a", "open_a"]));
});

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
  expect(historyRowText(s)).toEqual({ date: new Date(s.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), acc: "3/4", avg: "2.2с", flag: "", stars: 2 });
  expect(historyRowText({ ...s, firstTryCorrect: 4 }).stars).toBe(3);
  expect(historyRowText({ ...s, firstTryCorrect: 0, questionsTotal: 0 }).stars).toBe(0);
  expect(historyRowText({ ...s, blocked: true }).flag).toBe("⛔");
  expect(historyRowText({ ...s, completed: false, blocked: false }).flag).toBe("…");
});
