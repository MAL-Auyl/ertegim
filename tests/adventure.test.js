const { test, expect, describe } = require("bun:test");
const A = require("../public/adventure.js");
const { TALES } = require("../public/story.js");

const PATH = A.adventurePath(TALES);
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("path and locks", () => {
  test("the fox tale first, then every tale of the library in order", () => {
    expect(PATH[0]).toBe("story");
    expect(PATH.slice(1)).toEqual(Object.keys(TALES));
    expect(PATH.length).toBeGreaterThanOrEqual(4);
  });

  test("a fresh child: only the first stop is open, and it is current", () => {
    const s = A.stopStatus(PATH, {});
    expect(s[0]).toEqual({ id: "story", status: "open", current: true });
    expect(s.slice(1).every((x) => x.status === "locked" && !x.current)).toBe(true);
  });

  test("finishing a stop opens exactly the next one", () => {
    const s = A.stopStatus(PATH, { done: { story: "x" } });
    expect(s.map((x) => x.status).slice(0, 3)).toEqual(["done", "open", "locked"]);
    expect(s[1].current).toBe(true);
  });

  test("homework and «open all» never leave a lock in the way", () => {
    const hw = A.stopStatus(PATH, {}, { assigned: [PATH[3]] });
    expect(hw[3].status).toBe("open");
    expect(hw[1].status).toBe("locked");
    expect(A.stopStatus(PATH, {}, { unlockAll: true }).every((x) => x.status === "open")).toBe(true);
  });
});

describe("chest, treasures and streak", () => {
  test("the day's first finished activity opens the chest; the second does not", () => {
    let { state, result } = A.recordPlay({}, "story", PATH, { now: at(2026, 10, 8, 10), seed: "c1" });
    expect(result).toMatchObject({ newlyDone: true, unlocked: PATH[1], chest: true, streak: 1, coins: 0 });
    expect(result.treasures.length).toBe(1);
    expect(A.TREASURES[result.treasures[0]]).toBeDefined();
    ({ state, result } = A.recordPlay(state, "letter-a", PATH, { now: at(2026, 10, 8, 17), seed: "c1" }));
    expect(result).toMatchObject({ newlyDone: false, unlocked: null, chest: false, treasures: [], streak: 1 });
    expect(Object.keys(state.treasures).length).toBe(1);
  });

  test("replaying a finished tale does not unlock or re-mark anything", () => {
    const first = A.recordPlay({}, "story", PATH, { now: at(2026, 10, 8) }).state;
    const { result } = A.recordPlay(first, "story", PATH, { now: at(2026, 10, 9) });
    expect(result.newlyDone).toBe(false);
    expect(result.unlocked).toBeNull();
    expect(result.chest).toBe(true); // a new day still opens the chest
  });

  test("3 and 7 days in a row add a bonus treasure; a missed day restarts the count", () => {
    let st = {};
    const counts = [];
    for (let d = 1; d <= 7; d++) {
      const r = A.recordPlay(st, "letter-a", PATH, { now: at(2026, 10, d), seed: "c" });
      st = r.state;
      counts.push([r.result.streak, r.result.treasures.length]);
    }
    expect(counts).toEqual([[1, 1], [2, 1], [3, 2], [4, 1], [5, 1], [6, 1], [7, 2]]);
    const gap = A.recordPlay(st, "letter-a", PATH, { now: at(2026, 10, 9), seed: "c" });
    expect(gap.result.streak).toBe(1);
  });

  test("streak survives until the day is over", () => {
    const days = ["2026-10-06", "2026-10-07"];
    expect(A.streak(days, at(2026, 10, 8, 9))).toBe(2); // not played yet today
    expect(A.streak(days, at(2026, 10, 9, 9))).toBe(0); // a whole day missed
    expect(A.streak([], at(2026, 10, 8))).toBe(0);
  });

  test("same child + same day → same treasure; every treasure is collectable, then coins", () => {
    expect(A.pickTreasure({}, "c|2026-10-08|0")).toBe(A.pickTreasure({}, "c|2026-10-08|0"));
    let st = {};
    const seen = new Set();
    let coins = 0;
    for (let d = 0; d < 40; d++) {
      const r = A.recordPlay(st, "letter-a", PATH, { now: at(2026, 1, 1) + d * 86400000, seed: "kid" });
      st = r.state;
      r.result.treasures.forEach((t) => seen.add(t));
      coins += r.result.coins;
    }
    expect(seen.size).toBe(Object.keys(A.TREASURES).length);
    expect(Object.keys(st.treasures).length).toBe(Object.keys(A.TREASURES).length);
    expect(coins).toBeGreaterThan(0);
    expect(st.coins).toBe(coins);
  });

  test("days are kept bounded and de-duplicated", () => {
    let st = {};
    for (let d = 0; d < 90; d++) st = A.recordPlay(st, "x", PATH, { now: at(2026, 1, 1) + d * 86400000 }).state;
    expect(st.days.length).toBe(60);
    expect(new Set(st.days).size).toBe(60);
  });
});

describe("migration and storage", () => {
  test("a child who played before the map: finished stops come from the history, no retro treasures", () => {
    const history = [
      { date: "2026-10-01T10:00:00.000Z", activity: "bear-honey", completed: true },
      { date: "2026-09-30T10:00:00.000Z", completed: true }, // the fox tale (no activity field)
      { date: "2026-09-29T10:00:00.000Z", activity: "owl-star", completed: false },
      { date: "2026-09-28T10:00:00.000Z", activity: "letter-a", completed: true }, // not on the path
    ];
    const st = A.seedFromHistory({}, history, PATH);
    expect(Object.keys(st.done).sort()).toEqual(["bear-honey", "story"]);
    expect(st.treasures).toEqual({});
    expect(st.seeded).toBe(true);
    expect(A.seedFromHistory({ ...st, done: {} }, history, PATH).done).toEqual({}); // seeds once
  });

  test("Adventure stores per child and seeds on first load", () => {
    const { Profiles } = require("../public/profiles.js");
    const { Session } = require("../public/session.js");
    const mem = new Map();
    const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    Profiles._storage = store; Session._storage = store; A.Adventure._storage = store;
    globalThis.Profiles = Profiles; globalThis.Session = Session;
    try {
      store.setItem("ertegim.sessions", JSON.stringify([{ date: "2026-10-01T10:00:00.000Z", completed: true }]));
      expect(A.Adventure.load().done.story).toBeDefined();
      const r = A.Adventure.record("bear-honey", at(2026, 10, 8));
      expect(r.chest).toBe(true);
      expect(A.Adventure.stops()[2]).toMatchObject({ id: PATH[2], status: "open", current: true });
      const p2 = Profiles.add({ name: "Екінші" });
      expect(A.Adventure.key()).toBe(`ertegim.adventure:${p2.id}`);
      expect(A.Adventure.stops()[1].status).toBe("locked"); // the second child starts at the beginning
    } finally {
      delete globalThis.Profiles; delete globalThis.Session;
      Profiles._storage = null; Session._storage = null; A.Adventure._storage = null;
    }
  });
});

describe("pages are wired to the map", () => {
  const fs = require("fs");
  const path = require("path");
  const read = (f) => fs.readFileSync(path.join(__dirname, "../public", f), "utf8");
  test("home draws the map after story/profiles/session/stickers, and the play button follows it", () => {
    const index = read("index.html");
    const pos = (s) => index.indexOf(s);
    for (const dep of ['<script src="story.js">', '<script src="profiles.js">', '<script src="session.js">', '<script src="stickers.js">']) {
      expect(pos(dep)).toBeLessThan(pos('<script src="adventure.js">'));
    }
    expect(index).toContain("Adventure.stops({ assigned: settings.assigned || [], unlockAll: !!settings.unlockAll })");
    expect(index).toContain('document.getElementById("heroPlay").href = href(cur.id)');
    expect(index).toContain('track.insertAdjacentHTML("beforeend", `<svg class="adv-trail"'); // never shifts the zigzag
  });
  test("a finished run records the play on the end screen", () => {
    const story = read("story.html");
    expect(story.indexOf('<script src="adventure.js">')).toBeLessThan(story.indexOf('<script src="app.js">'));
    const app = read("app.js");
    expect(app).toContain("revealAdventure(lastSummary);");
    expect(app).toMatch(/if \(typeof Adventure === "undefined" \|\| !summary \|\| !summary\.completed \|\| summary\.blocked\) return;/);
  });
});
