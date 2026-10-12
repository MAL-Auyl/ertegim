const { test, expect, describe } = require("bun:test");
const P = require("../public/practice.js");
const H = require("../public/homework.js");
const { ACTIVITIES } = require("../public/story.js");
const KNOWN = Object.keys(ACTIVITIES);

const DAY = 86400000;
const ISSUED = Date.parse("2026-10-05T08:00:00Z");
const plan = H.normalizePlan({ activities: ["letter-a", "count"], perWeek: 3, createdAt: new Date(ISSUED).toISOString() }, KNOWN);
const at = (d) => new Date(ISSUED + d * DAY).toISOString(); // d days after the plan (negative: before)
const S = (d, activity, skills, extra = {}) => {
  const asked = Object.values(skills).filter((x) => x !== "skipped");
  return { date: at(d), activity, skills, completed: true, questionsTotal: asked.length, firstTryCorrect: asked.filter((x) => x === "first").length, visualHints: 0, adultAnswers: 0, gestureAnswers: 0, ...extra };
};
const newestFirst = (list) => [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
const A_ALL = (st) => ({ sound_a: st, word_a: st, pick_a: st, open_a: st });

describe("round summary", () => {
  test("counts only sessions since the plan, per assigned activity, with the pro-rated target", () => {
    const h = newestFirst([
      S(-3, "letter-a", A_ALL("reveal")), // before: not in the round
      S(1, "letter-a", { sound_a: "reask", word_a: "first", pick_a: "first", open_a: "first" }, { visualHints: 1 }),
      S(3, "letter-a", A_ALL("first"), { adultAnswers: 2 }),
      S(4, "bear-honey", { bh_buzz: "first" }), // outside the plan
      S(5, "letter-a", A_ALL("first"), { completed: false }),
    ]);
    const r = P.roundSummary(plan, h, { now: ISSUED + 6.5 * DAY });
    expect(r.days).toBe(7);
    expect(r.sessions).toBe(4);
    expect(r.extra).toBe(1);
    const a = r.perActivity.find((x) => x.id === "letter-a");
    expect([a.sessions, a.done, a.expected, a.asked, a.first, a.hints, a.adult]).toEqual([3, 2, 3, 12, 11, 1, 2]);
    expect(a.last).toBe(at(5));
    const c = r.perActivity.find((x) => x.id === "count");
    expect([c.sessions, c.done, c.firstShare, c.last]).toEqual([0, 0, null, null]);
    expect([r.done, r.expected]).toEqual([2, 6]);
  });

  test("target grows after the first week: day 10 of 3/week → 5", () => {
    expect(P.roundSummary(plan, [], { now: ISSUED + 9.5 * DAY }).perActivity[0].expected).toBe(5);
    expect(P.roundSummary(plan, [], { now: ISSUED + 2 * DAY }).perActivity[0].expected).toBe(3);
  });

  test("areas: first-try share before the plan → during it", () => {
    const h = newestFirst([
      S(-4, "letter-a", A_ALL("reveal")),
      S(-2, "letter-a", { sound_a: "reask", word_a: "first", pick_a: "first", open_a: "first" }),
      S(2, "letter-a", A_ALL("first")),
    ]);
    const sounds = P.roundSummary(plan, h, { now: ISSUED + 3 * DAY }).areas.find((a) => a.id === "sounds");
    expect([sounds.beforeAsked, sounds.beforeShare, sounds.asked, sounds.firstShare]).toEqual([2, 0, 1, 1]);
    expect(P.roundSummary(plan, h, { now: ISSUED + 3 * DAY }).areas.find((a) => a.id === "counting")).toBeUndefined();
  });

  test("no plan → null", () => {
    expect(P.roundSummary(null, [])).toBeNull();
    expect(P.nextPlanProposal(null, [])).toBeNull();
  });
});

describe("next-set proposal", () => {
  test("mastered → replaced with a similar activity; not opened → kept with a question; hard → kept", () => {
    const h = newestFirst([
      S(1, "letter-a", A_ALL("first")),
      S(3, "letter-a", { sound_a: "first", word_a: "first", pick_a: "first", open_a: "reask" }),
      S(1, "bear-honey", { bh_help: "first", bh_buzz: "first", bh_count: "first", bh_pick: "first", bh_thanks: "first" }),
    ]);
    const p = P.nextPlanProposal(plan, h, { now: ISSUED + 6 * DAY });
    const a = p.items.find((x) => x.id === "letter-a");
    expect(a.action).toBe("replace");
    expect(a.reason).toContain("88 %");
    // same main area (sounds), not in the plan, never played → the «О» lesson first
    expect(a.with).toBe("letter-o");
    expect(P.activityAreas(a.with)).toContain("sounds");
    const c = p.items.find((x) => x.id === "count");
    expect(c.action).toBe("keep");
    expect(c.reason).toContain("ещё не открывали");
    expect(p.activities.slice(0, 2)).toEqual(["letter-o", "count"]);
    expect(p.activities).not.toContain("letter-a");
  });

  test("mostly with help → keep, with the share", () => {
    const h = newestFirst([S(1, "count", { count: "reveal" }), S(2, "count", { count: "reask" }), S(3, "count", { count: "first" })]);
    const p = P.nextPlanProposal(plan, h, { now: ISSUED + 4 * DAY });
    const c = p.items.find((x) => x.id === "count");
    expect(c.action).toBe("keep");
    expect(c.reason).toContain("чаще с подсказкой (33 %");
  });

  test("one good session is not «mastered», one bad answer is not «with help»", () => {
    const p = P.nextPlanProposal(plan, [S(1, "count", { count: "first" })], { now: ISSUED + 2 * DAY });
    expect(p.items.find((x) => x.id === "count").action).toBe("keep");
    const q = P.nextPlanProposal(plan, [S(1, "count", { count: "reveal" })], { now: ISSUED + 2 * DAY });
    expect(q.items.find((x) => x.id === "count").reason).toBe("пока мало ответов (1) — продолжать");
  });

  test("the parents' load grows by one activity a round at most", () => {
    const p = P.nextPlanProposal(plan, [], { now: ISSUED + 2 * DAY }); // 2 activities, every other area «new»
    expect(p.activities.length).toBe(3);
    const one = H.normalizePlan({ activities: ["count"], perWeek: 2, createdAt: plan.createdAt }, KNOWN);
    expect(P.nextPlanProposal(one, [], { now: ISSUED + 2 * DAY }).activities.length).toBe(3); // a short plan may reach 3
  });

  test("adds at most 2 activities for uncovered areas, plan of at most 4", () => {
    const p = P.nextPlanProposal(plan, [], { now: ISSUED + 2 * DAY });
    const adds = p.items.filter((x) => x.action === "add");
    expect(adds.length).toBeLessThanOrEqual(2);
    expect(p.activities.length).toBeLessThanOrEqual(P.PRACTICE_MAX_ACTIVITIES);
    expect(new Set(p.activities).size).toBe(p.activities.length);
    for (const x of adds) {
      expect(plan.activities).not.toContain(x.id);
      expect(P.activityAreas(x.id)).toContain(x.area);
      expect(x.reason).toBeTruthy();
    }
  });

  test("an area not practised for a week comes before one never practised", () => {
    // counting & co. covered by the plan; breath practised 9 days before → stale
    const h = newestFirst([S(-9, "fox-birthday", { fb_blow: "first", fb_congrats: "first", fb_count: "first", fb_pick: "first", fb_gift: "first" })]);
    const p = P.nextPlanProposal(plan, h, { now: ISSUED + 1 * DAY });
    const first = p.items.find((x) => x.action === "add");
    expect(first.area).toBe("breath");
    expect(first.reason).toContain("не практиковали 10 дн.");
  });

  test("less than half done after a week → one session a week fewer; all done → said so", () => {
    const low = P.nextPlanProposal(plan, [S(1, "count", { count: "first" })], { now: ISSUED + 7 * DAY });
    expect(low.perWeek).toEqual({ from: 3, to: 2, reason: expect.stringContaining("сделано 1 из 6") });
    const early = P.nextPlanProposal(plan, [S(1, "count", { count: "first" })], { now: ISSUED + 3 * DAY });
    expect(early.perWeek.to).toBe(3); // the week is not over yet
    const full = [0, 1, 2].flatMap((d) => [S(d + 1, "count", { count: "reask" }), S(d + 1.5, "letter-a", A_ALL("reask"))]);
    const done = P.nextPlanProposal(plan, newestFirst(full), { now: ISSUED + 6.5 * DAY });
    expect(done.perWeek.to).toBe(3);
    expect(done.perWeek.reason).toBe("задание выполнено полностью");
  });

  test("works on results that came through a link", () => {
    const home = { id: "pHome", linkedId: "p1", name: "Айгерім" };
    const h = newestFirst([S(1, "letter-a", A_ALL("first")), S(2, "letter-a", A_ALL("first"))]);
    const b = H.resultsFromHash(new URL(H.resultsLink("https://e.kz", H.resultsPayload(home, plan, h))).hash);
    const p = P.nextPlanProposal(plan, b.sessions, { now: ISSUED + 3 * DAY });
    expect(p.items.find((x) => x.id === "letter-a").action).toBe("replace");
  });
});
