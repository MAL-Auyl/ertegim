const { test, expect, describe } = require("bun:test");
const classic = require("../public/classify-local.js");

// ESM module under test — loaded the same way as lib/stt-hints-core.js in
// tests/stt-hints.test.js (bun test runs this file as CommonJS).
const load = () => import("../lib/stt-pick.js");

describe("phonetic parity with public/classify-local.js", () => {
  const words = [
    "қасық", "үш", "төрт", "бір", "екі", "бес", "жаңғырық", "ұйқас", "мысық",
    "балық", "ёжик", "эхо", "солға", "оңға", "әже", "өзен", "мама", "аққу",
    "объект", "тьли", "", "Үш",
  ];
  test("same mapping for every word", async () => {
    const { phonetic } = await load();
    for (const w of words) expect(phonetic(w)).toBe(classic.phonetic(w));
  });
});

describe("isHallucination", () => {
  test("known Whisper junk", async () => {
    const { isHallucination } = await load();
    expect(isHallucination("Субтитры сделал DimaTorzok")).toBe(true);
    expect(isHallucination("продолжение следует...")).toBe(true);
    expect(isHallucination("Спасибо за просмотр!")).toBe(true);
    expect(isHallucination("Thank you for watching")).toBe(true);
    expect(isHallucination("[музыка]")).toBe(true);
    expect(isHallucination("♪♪♪")).toBe(true);
  });
  test("punctuation-only and empty", async () => {
    const { isHallucination } = await load();
    expect(isHallucination("...")).toBe(true);
    expect(isHallucination("   ")).toBe(true);
    expect(isHallucination("")).toBe(true);
  });
  test("real child answers are not hallucinations", async () => {
    const { isHallucination } = await load();
    expect(isHallucination("үш")).toBe(false);
    expect(isHallucination("в лес")).toBe(false);
  });
});

describe("expectedForms", () => {
  test("count node uses NUM_FORMS[trackCount]", async () => {
    const { expectedForms } = await load();
    const e = expectedForms("q_tracks", { trackCount: 3 });
    expect(e.kind).toBe("count");
    expect(e.forms).toContain("үш");
    expect(e.forms).toContain("три");
  });
  test("fork node is a choice with both routes", async () => {
    const { expectedForms } = await load();
    const e = expectedForms("q_fork", {});
    expect(e.kind).toBe("choice");
    expect(e.forms).toContain("лес");
    expect(e.forms).toContain("өзен");
  });
  test("courage is empathy, echo is rhyme, unknown is free", async () => {
    const { expectedForms } = await load();
    expect(expectedForms("q_courage", {})).toEqual({ kind: "empathy", forms: [] });
    expect(expectedForms("q_echo", {})).toEqual({ kind: "rhyme", forms: [] });
    expect(expectedForms("intro", {}).kind).toBe("free");
  });
});

describe("scoreTranscript", () => {
  test("count: «тры штуки» for 3 → 1", async () => {
    const { scoreTranscript, expectedForms } = await load();
    expect(scoreTranscript("тры штуки", expectedForms("q_tracks", { trackCount: 3 }))).toBe(1);
  });
  test("count: wrong number → 0", async () => {
    const { scoreTranscript, expectedForms } = await load();
    expect(scoreTranscript("бес", expectedForms("q_tracks", { trackCount: 3 }))).toBe(0);
  });
  test("choice: «в лес» → 1", async () => {
    const { scoreTranscript, expectedForms } = await load();
    expect(scoreTranscript("в лес", expectedForms("q_fork", {}))).toBe(1);
  });
  test("rhyme: «қасық» → 1, «үй» → 0", async () => {
    const { scoreTranscript, expectedForms } = await load();
    const e = expectedForms("q_echo", {});
    expect(scoreTranscript("қасық", e)).toBe(1);
    expect(scoreTranscript("үй", e)).toBe(0);
  });
  test("empathy: two meaningful words → 1", async () => {
    const { scoreTranscript, expectedForms } = await load();
    expect(scoreTranscript("қорықпа мен қасыңдамын", expectedForms("q_courage", {}))).toBe(1);
  });
  test("free: non-empty → 0.5", async () => {
    const { scoreTranscript, expectedForms } = await load();
    expect(scoreTranscript("бірдеңе", expectedForms("intro", {}))).toBe(0.5);
  });
  test("empty and hallucination → 0", async () => {
    const { scoreTranscript, expectedForms } = await load();
    const e = expectedForms("q_tracks", { trackCount: 3 });
    expect(scoreTranscript("", e)).toBe(0);
    expect(scoreTranscript("Продолжение следует", e)).toBe(0);
  });
});

describe("pickTranscript", () => {
  test("kk «уш» beats ru «уж» for count 3", async () => {
    const { pickTranscript, expectedForms } = await load();
    const e = expectedForms("q_tracks", { trackCount: 3 });
    const out = pickTranscript(
      [
        { lang: "kk", text: "уш", noSpeechProb: 0.1, avgLogprob: -0.8 },
        { lang: "ru", text: "уж", noSpeechProb: 0.1, avgLogprob: -0.2 },
      ],
      e,
    );
    expect(out.lang).toBe("kk");
    expect(out.transcript).toBe("уш");
    expect(out.score).toBe(1);
    expect(out.lowConfidence).toBe(false);
  });
  test("both zero-score → lowConfidence, keeps best non-empty text", async () => {
    const { pickTranscript, expectedForms } = await load();
    const e = expectedForms("q_tracks", { trackCount: 3 });
    const out = pickTranscript(
      [
        { lang: "kk", text: "мм", noSpeechProb: 0.1, avgLogprob: -0.5 },
        { lang: "ru", text: "", noSpeechProb: 0.3, avgLogprob: -0.5 },
      ],
      e,
    );
    expect(out.lowConfidence).toBe(true);
    expect(out.transcript).toBe("мм");
  });
  test("hallucinated candidates are dropped", async () => {
    const { pickTranscript, expectedForms } = await load();
    const out = pickTranscript(
      [{ lang: "kk", text: "Субтитры сделал DimaTorzok", noSpeechProb: 0.1, avgLogprob: -0.1 }],
      expectedForms("q_echo", {}),
    );
    expect(out.transcript).toBe("");
    expect(out.lowConfidence).toBe(true);
  });
  test("noSpeechProb 0.9 with score 0 → lowConfidence", async () => {
    const { pickTranscript, expectedForms } = await load();
    const out = pickTranscript(
      [{ lang: "kk", text: "мм", noSpeechProb: 0.9, avgLogprob: -0.4 }],
      expectedForms("q_tracks", { trackCount: 3 }),
    );
    expect(out.lowConfidence).toBe(true);
  });
  test("noSpeechProb 0.9 but exact expected match → accepted", async () => {
    const { pickTranscript, expectedForms } = await load();
    const out = pickTranscript(
      [{ lang: "kk", text: "үш", noSpeechProb: 0.9, avgLogprob: -1.9 }],
      expectedForms("q_tracks", { trackCount: 3 }),
    );
    expect(out.lowConfidence).toBe(false);
    expect(out.transcript).toBe("үш");
    expect(out.score).toBe(1);
  });
  test("bad avgLogprob alone is low confidence", async () => {
    const { pickTranscript, expectedForms } = await load();
    const out = pickTranscript(
      [{ lang: "ru", text: "какое-то слово", noSpeechProb: 0.1, avgLogprob: -1.5 }],
      expectedForms("intro", {}),
    );
    expect(out.lowConfidence).toBe(true);
  });
  test("no candidates at all", async () => {
    const { pickTranscript, expectedForms } = await load();
    const out = pickTranscript([], expectedForms("intro", {}));
    expect(out).toMatchObject({ transcript: "", lowConfidence: true, score: 0 });
    expect(out.confidence).toBe(0);
  });
  test("tie on score → higher avgLogprob wins", async () => {
    const { pickTranscript, expectedForms } = await load();
    const out = pickTranscript(
      [
        { lang: "kk", text: "бірдеңе", noSpeechProb: 0.1, avgLogprob: -0.9 },
        { lang: "ru", text: "что-то", noSpeechProb: 0.1, avgLogprob: -0.2 },
      ],
      expectedForms("intro", {}),
    );
    expect(out.lang).toBe("ru");
  });
  test("confidence is 0..1 and rises with a clean match", async () => {
    const { pickTranscript, expectedForms } = await load();
    const e = expectedForms("q_tracks", { trackCount: 3 });
    const good = pickTranscript([{ lang: "kk", text: "үш", noSpeechProb: 0.0, avgLogprob: -0.1 }], e);
    const meh = pickTranscript([{ lang: "kk", text: "мм", noSpeechProb: 0.2, avgLogprob: -0.9 }], e);
    expect(good.confidence).toBeGreaterThan(meh.confidence);
    expect(good.confidence).toBeLessThanOrEqual(1);
    expect(meh.confidence).toBeGreaterThanOrEqual(0);
  });
});
