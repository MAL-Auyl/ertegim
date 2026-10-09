const { test, expect, describe } = require("bun:test");
const M = require("../public/skillmap.js");
const S = require("../public/story.js");
const R = require("../public/report.js");

const DAY = 86400000;
const NOW = Date.parse("2026-10-09T12:00:00Z");
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
// newest first, as Session.history() returns it
const sess = (daysAgo, activity, skills) => ({ date: at(daysAgo), activity, skills });
const card = (map, id) => map.find((a) => a.id === id);

describe("areas", () => {
  test("every skill of every activity belongs to a known area", () => {
    const ids = new Set(M.SKILL_AREAS.map((a) => a.id));
    for (const a of Object.values(S.ACTIVITIES)) {
      for (const k of a.skills) {
        expect(M.skillAreaOf(k), `${a.id}: ${k}`).toBeTruthy();
        expect(ids.has(M.skillAreaOf(k)), `${a.id}: ${k} → ${M.skillAreaOf(k)}`).toBe(true);
      }
    }
  });

  test("tale skills take their area from the tale's own data", () => {
    expect(M.skillAreaOf("bh_buzz")).toBe("sounds");
    expect(M.skillAreaOf("fb_blow")).toBe("breath");
    expect(M.skillAreaOf("os_count")).toBe("counting");
    const idx = M.skillAreaIndex({ x: { skills: { x_new: { area: "words" } } } });
    expect(idx.x_new).toBe("words");
    expect(idx.sound_a).toBe("sounds"); // built-ins stay
    expect(M.skillAreaOf("nope")).toBeNull();
  });

  test("every area is trained by at least one activity", () => {
    for (const a of M.SKILL_AREAS) expect(M.areaSuggestions(a.id, []).length, a.id).toBeGreaterThan(0);
  });
});

describe("skillMap", () => {
  test("an empty history: every area «ещё не практиковали» with suggestions", () => {
    const map = M.skillMap([], { now: NOW });
    expect(map.map((a) => a.id)).toEqual(M.SKILL_AREAS.map((a) => a.id));
    for (const a of map) {
      expect(a.asked).toBe(0);
      expect(a.firstShare).toBeNull();
      expect(a.daysSince).toBeNull();
      expect(a.note).toBe("ещё не практиковали");
      expect(a.attention).toBe("new");
      expect(a.suggest.length).toBeGreaterThan(0);
    }
  });

  test("counts answers per area across activities; skipped is not an answer", () => {
    const h = [
      sess(0, "bear-honey", { bh_help: "first", bh_buzz: "reask", bh_count: "first", bh_pick: "first", bh_thanks: "skipped" }),
      sess(1, "letter-a", { sound_a: "reveal", word_a: "first", pick_a: "first", open_a: "first" }),
      sess(2, "count", { count: "first" }),
    ];
    const map = M.skillMap(h, { now: NOW });
    const sounds = card(map, "sounds");
    expect([sounds.asked, sounds.first, sounds.reask, sounds.reveal, sounds.sessions]).toEqual([2, 0, 1, 1, 2]);
    expect(sounds.daysSince).toBe(0);
    const counting = card(map, "counting");
    expect([counting.asked, counting.first, counting.sessions, counting.daysSince]).toEqual([2, 2, 2, 0]);
    expect(card(map, "words").asked).toBe(1); // bh_thanks skipped, word_a counted
    expect(card(map, "words").daysSince).toBe(1);
    expect(card(map, "understanding").firstShare).toBe(1);
    expect(card(map, "letters").attention).toBe("new");
  });

  test("observation wording follows the first-try share, and needs 3 answers", () => {
    const many = (st, n) => Array.from({ length: n }, (_, i) => sess(i, "count", { count: st }));
    expect(card(M.skillMap(many("first", 2), { now: NOW }), "counting").note).toBe("пока мало ответов для выводов");
    expect(card(M.skillMap(many("first", 5), { now: NOW }), "counting").note).toBe("чаще всего отвечает сразу");
    expect(card(M.skillMap(many("reveal", 5), { now: NOW }), "counting").note).toBe("чаще нужна подсказка");
    expect(card(M.skillMap(many("reveal", 5), { now: NOW }), "counting").attention).toBe("help");
    const mixed = [...many("first", 3), ...many("reask", 2)];
    expect(card(M.skillMap(mixed, { now: NOW }), "counting").note).toBe("больше половины ответов — сразу");
    expect(card(M.skillMap(mixed, { now: NOW }), "counting").attention).toBeNull();
  });

  test("an area not practised for a week asks for attention even when it went well", () => {
    const h = [sess(9, "count", { count: "first" }), sess(10, "count", { count: "first" }), sess(11, "count", { count: "first" })];
    const c = card(M.skillMap(h, { now: NOW }), "counting");
    expect(c.daysSince).toBe(9);
    expect(c.attention).toBe("stale");
    expect(c.suggest.length).toBeGreaterThan(0);
  });

  test("trend: the last 3 sessions of the area vs the 3 before", () => {
    // oldest → newest: reveal ×3, then first ×3
    const up = [0, 1, 2].map((d) => sess(d, "count", { count: "first" })).concat([3, 4, 5].map((d) => sess(d, "count", { count: "reveal" })));
    expect(card(M.skillMap(up, { now: NOW }), "counting").trend).toBe("up");
    const down = [0, 1, 2].map((d) => sess(d, "count", { count: "reask" })).concat([3, 4, 5].map((d) => sess(d, "count", { count: "first" })));
    expect(card(M.skillMap(down, { now: NOW }), "counting").trend).toBe("down");
    const flat = [0, 1, 2, 3].map((d) => sess(d, "count", { count: "first" }));
    expect(card(M.skillMap(flat, { now: NOW }), "counting").trend).toBe("flat");
    expect(card(M.skillMap(flat.slice(0, 3), { now: NOW }), "counting").trend).toBeNull(); // too few
  });

  test("an area's share per session: two dialogue questions in one tale count as one point", () => {
    const h = [sess(0, "fox-birthday", { fb_congrats: "first", fb_gift: "reveal" })];
    const d = card(M.skillMap(h, { now: NOW }), "dialogue");
    expect([d.asked, d.sessions, d.firstShare]).toEqual([2, 1, 0.5]);
  });

  test("garbage in the history does not throw", () => {
    expect(() => M.skillMap([null, {}, { skills: null }, { date: "bad", skills: { count: "first" } }], { now: NOW })).not.toThrow();
    const c = card(M.skillMap([{ date: "bad", skills: { count: "first" } }], { now: NOW }), "counting");
    expect(c.asked).toBe(1);
    expect(c.daysSince).toBeNull();
  });
});

describe("suggestions", () => {
  test("only activities that train the area, never-played first, at most 3", () => {
    const s = M.areaSuggestions("sounds", []);
    expect(s.length).toBeLessThanOrEqual(3);
    for (const id of s) expect(S.ACTIVITIES[id].skills.some((k) => M.skillAreaOf(k) === "sounds"), id).toBe(true);
    // played letter-a yesterday → it goes to the end
    const played = M.areaSuggestions("sounds", [sess(1, "letter-a", {})], S.ACTIVITIES, 10);
    expect(played[played.length - 1]).toBe("letter-a");
    expect(played).toContain("bear-honey");
  });

  test("breath and hearing: the echo of the fox tale and the candles", () => {
    expect(M.areaSuggestions("breath", [], S.ACTIVITIES, 10).sort()).toEqual(["fox-birthday", "story"]);
  });
});

describe("parent report chips", () => {
  test("areas the session touched, in map order, skipped ones left out", () => {
    const areas = M.sessionAreas({ skills: { bh_thanks: "first", bh_buzz: "reask", bh_count: "skipped" } });
    expect(areas.map((a) => a.id)).toEqual(["sounds", "words"]);
    expect(M.sessionAreas({ skills: {} })).toEqual([]);
    expect(M.sessionAreas(null)).toEqual([]);
  });

  test("report.js renders them in Kazakh", () => {
    const html = R.areaChipsHTML({ skills: { count: "first", choice: "reveal" } });
    expect(html).toContain("Түсіну");
    expect(html).toContain("Санау");
    expect(html.indexOf("Түсіну")).toBeLessThan(html.indexOf("Санау"));
    expect(R.areaChipsHTML({ skills: {} })).toBe("");
  });
});
