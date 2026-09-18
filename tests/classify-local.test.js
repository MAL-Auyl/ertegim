const { test, expect, describe } = require("bun:test");
const { localClassify, detectRoute, phonetic, NUM_FORMS } = require("../public/classify-local.js");

const NUM_KK = ["", "бір", "екі", "үш", "төрт", "бес"];
const NUM_RU = ["", "один", "два", "три", "четыре", "пять"];
const ctx = { trackCount: 3, brotherName: "балық", numKk: NUM_KK, numRu: NUM_RU };

describe("count (exact)", () => {
  const node = { mode: "exact", skill: "count" };
  test("accepts kk number", () => {
    expect(localClassify(node, "үш", ctx).label).toBe("correct");
  });
  test("accepts ru number with STT noise", () => {
    expect(localClassify(node, "тры штуки", ctx).label).toBe("correct");
  });
  test("accepts digit", () => {
    expect(localClassify(node, "3", ctx).label).toBe("correct");
  });
  test("rejects wrong number", () => {
    expect(localClassify(node, "бес", ctx).label).toBe("unclear");
  });
  test("empty → unclear", () => {
    expect(localClassify(node, "   ", ctx).label).toBe("unclear");
  });
});

describe("rhyme (exact)", () => {
  const node = { mode: "exact", skill: "rhyme" };
  test("accepts -ық suffix", () => {
    expect(localClassify(node, "қасық", ctx).label).toBe("correct");
  });
  test("accepts -ик suffix", () => {
    expect(localClassify(node, "столик", ctx).label).toBe("correct");
  });
  test("rejects no rhyme", () => {
    expect(localClassify(node, "үй", ctx).label).toBe("unclear");
  });
});

describe("branch (choice)", () => {
  const node = { mode: "branch", skill: "choice" };
  test("солға → river", () => {
    const r = localClassify(node, "солға барайық", ctx);
    expect(r.label).toBe("correct");
    expect(r.route).toBe("river");
  });
  test("в лес → forest", () => {
    expect(localClassify(node, "пойдём в лес", ctx).route).toBe("forest");
  });
  test("направо → forest", () => {
    expect(localClassify(node, "направо", ctx).route).toBe("forest");
  });
  test("өзен → river", () => {
    expect(localClassify(node, "өзенге", ctx).route).toBe("river");
  });
  test("no keyword → unclear, no route", () => {
    const r = localClassify(node, "не знаю", ctx);
    expect(r.label).toBe("unclear");
    expect(r.route).toBeUndefined();
  });
  test("солай ма (filler, not a route answer) → unclear, no route", () => {
    const r = localClassify(node, "солай ма", ctx);
    expect(r.label).toBe("unclear");
    expect(r.route).toBeUndefined();
  });
});

describe("open (empathy)", () => {
  const node = { mode: "open", skill: "empathy" };
  test("any real phrase is correct", () => {
    expect(localClassify(node, "қорықпа, мен қасыңдамын", ctx).label).toBe("correct");
  });
  test("single short noise word → unclear", () => {
    expect(localClassify(node, "ну", ctx).label).toBe("unclear");
  });
  test("empty → unclear", () => {
    expect(localClassify(node, "", ctx).label).toBe("unclear");
  });
});

describe("detectRoute", () => {
  test("river keywords", () => {
    expect(detectRoute(["налево"])).toBe("river");
    expect(detectRoute(["река"])).toBe("river");
    expect(detectRoute(["сол"])).toBe("river");
  });
  test("forest keywords", () => {
    expect(detectRoute(["оңға"])).toBe("forest");
    expect(detectRoute(["орманға"])).toBe("forest");
  });
  test("none", () => {
    expect(detectRoute(["привет"])).toBeNull();
  });
});

describe("phonetic", () => {
  test("collapses Kazakh-specific letters to their nearest Russian sound", () => {
    expect(phonetic("қасық")).toBe("касик");
    expect(phonetic("үш")).toBe("уш");
    expect(phonetic("төрт")).toBe("торт");
    expect(phonetic("өзен")).toBe("озен");
  });
  test("drops soft/hard signs and doubled letters", () => {
    expect(phonetic("пять")).toBe("пят");
    expect(phonetic("аллея")).toBe("алея");
  });
});

describe("count with child pronunciations", () => {
  const node = { mode: "exact", skill: "count" };
  for (const [n, forms] of [[3, ["уч", "тли", "тьли", "тры"]], [4, ["четыле", "торт"]], [5, ["пат", "бес", "пяць"]], [2, ["еки", "дфа"]], [1, ["бир", "адин"]]]) {
    for (const f of forms) {
      test(`${f} → ${n}`, () => {
        expect(localClassify(node, f, { ...ctx, trackCount: n }).label).toBe("correct");
      });
    }
  }
  test("wrong number still unclear", () => {
    expect(localClassify(node, "уш", { ...ctx, trackCount: 4 }).label).toBe("unclear");
  });
  test("NUM_FORMS has 5 entries, each non-empty", () => {
    expect(NUM_FORMS.length).toBe(6);
    for (let i = 1; i <= 5; i++) expect(NUM_FORMS[i].length).toBeGreaterThan(2);
  });
});

describe("rhyme with phonetic suffix", () => {
  const node = { mode: "exact", skill: "rhyme" };
  test("қасик (mixed script) counts", () => {
    expect(localClassify(node, "қасик", ctx).label).toBe("correct");
  });
});
