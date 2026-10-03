const { test, expect, describe, beforeEach } = require("bun:test");
const { Stickers, STICKER_CATALOG, stickersFor } = require("../public/stickers.js");

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

beforeEach(() => { Stickers._storage = memStorage(); });

const done = { completed: true, blocked: false, route: null, questionsTotal: 4, firstTryCorrect: 2 };

describe("stickersFor", () => {
  test("a finished tale earns the fox, plus the hero of the route taken", () => {
    expect(stickersFor("story", done)).toEqual(["fox"]);
    expect(stickersFor("story", { ...done, route: "river" })).toEqual(["fox", "owl"]);
    expect(stickersFor("story", { ...done, route: "forest" })).toEqual(["fox", "bear"]);
  });
  test("a finished lesson earns its letter", () => {
    expect(stickersFor("letter-a", done)).toEqual(["letter-a"]);
  });
  test("all first-try adds the star; zero questions does not", () => {
    expect(stickersFor("story", { ...done, firstTryCorrect: 4 })).toEqual(["fox", "star"]);
    expect(stickersFor("letter-a", { ...done, questionsTotal: 0, firstTryCorrect: 0 })).toEqual(["letter-a"]);
  });
  test("blocked or unfinished runs earn nothing", () => {
    expect(stickersFor("story", { ...done, blocked: true })).toEqual([]);
    expect(stickersFor("story", { ...done, completed: false })).toEqual([]);
    expect(stickersFor("story", null)).toEqual([]);
  });
  test("an unknown activity earns nothing but the star", () => {
    expect(stickersFor("letter-zz", { ...done, firstTryCorrect: 4 })).toEqual(["star"]);
  });
});

describe("Stickers storage", () => {
  test("award returns only new ids and persists them", () => {
    expect(Stickers.award(["fox", "owl"], 1000)).toEqual(["fox", "owl"]);
    expect(Stickers.award(["fox", "bear"], 2000)).toEqual(["bear"]);
    expect(Stickers.award(["fox"])).toEqual([]);
    expect(Object.keys(Stickers.earned()).sort()).toEqual(["bear", "fox", "owl"]);
    expect(Stickers.has("fox")).toBe(true);
    expect(Stickers.has("star")).toBe(false);
  });
  test("unknown ids are ignored", () => {
    expect(Stickers.award(["nope", "fox"])).toEqual(["fox"]);
    expect(Stickers.has("nope")).toBe(false);
  });
  test("shelf lists the whole catalogue in order with earnedAt", () => {
    Stickers.award(["letter-a"], 5000);
    const shelf = Stickers.shelf();
    expect(shelf.map((s) => s.id)).toEqual(Object.keys(STICKER_CATALOG));
    expect(shelf.find((s) => s.id === "letter-a").earnedAt).toBe(new Date(5000).toISOString());
    expect(shelf.find((s) => s.id === "fox").earnedAt).toBeNull();
    for (const s of shelf) { expect(s.kk.length).toBeGreaterThan(0); expect(s.img).toMatch(/^\/images\//); }
  });
  test("storage unavailable → earned is empty, award still reports the new ones", () => {
    Stickers._storage = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(Stickers.earned()).toEqual({});
    expect(Stickers.award(["fox"])).toEqual(["fox"]);
  });
  test("corrupt storage reads as empty", () => {
    Stickers._storage.setItem("ertegim.stickers", "[1,2]");
    expect(Stickers.earned()).toEqual({});
  });
});
