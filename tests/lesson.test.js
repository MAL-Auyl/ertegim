// Letter lesson «А» (public/story.js LESSON_A + ACTIVITIES): graph
// integrity, the new node modes, and parity between the browser-side word
// lists and the server-side copies in lib/stt-pick.js.
const { test, expect, describe } = require("bun:test");
const {
  STORY, LESSON_A, ACTIVITIES, FINAL_IDS,
  LESSON_A_SOUND_FORMS, LESSON_A_ALMA_FORMS, LESSON_A_PICK_FORMS,
} = require("../public/story.js");
const { localClassify, detectChoice, matchesImitate, destutter } = require("../public/classify-local.js");

const ids = Object.keys(LESSON_A);
const refs = (n) => [
  n.next, n.onCorrect, n.onReask, n.onReveal,
  ...(n.onAnswer ? Object.values(n.onAnswer) : []),
  ...(n.onOther ? Object.values(n.onOther) : []),
].filter(Boolean);

describe("LESSON_A graph", () => {
  test("every referenced node exists in the lesson or is the shared parent_report", () => {
    for (const id of ids) for (const r of refs(LESSON_A[id])) expect([...ids, "parent_report"]).toContain(r);
  });

  test("lesson ids never collide with the tale's", () => {
    for (const id of ids) {
      expect(STORY[id]).toBeUndefined();
      expect(id).toMatch(/^(a_|q_a_)/);
    }
  });

  test("every node has hero, pose, the lesson scene, the letter and both languages", () => {
    for (const id of ids) {
      const n = LESSON_A[id];
      expect(n.character).toBe("fox");
      expect(["idle", "talk", "happy", "confused", "think"]).toContain(n.pose);
      expect(n.bg).toBe("lesson");
      expect(n.letter).toBe("Аа");
      expect(n.kk.length).toBeGreaterThan(0);
      expect(n.ru.length).toBeGreaterThan(0);
      if (n.picture) expect(["mouth", "alma", "dop", "ana"]).toContain(n.picture);
    }
  });

  test("questions: imitate/pick/open with the re-ask ladder; pick has choices, onAnswer and onOther", () => {
    const qs = ids.filter((id) => LESSON_A[id].kind === "question");
    expect(qs.sort()).toEqual(["q_a_alma", "q_a_ana", "q_a_pick", "q_a_sound"]);
    for (const id of qs) {
      const n = LESSON_A[id];
      expect(["imitate", "pick", "open"]).toContain(n.mode);
      expect(ACTIVITIES["letter-a"].skills).toContain(n.skill);
      expect(n.criterion.length).toBeGreaterThan(10);
      expect(LESSON_A[n.onReask].next).toBe(id); // re-ask loops back
      expect(n.onReveal).toBeDefined();
      if (n.mode === "imitate") {
        expect(n.accept.length).toBeGreaterThan(2);
        expect(n.onCorrect).toBeDefined();
      }
      if (n.mode === "pick") {
        expect(n.choices.map((c) => c.id).sort()).toEqual(["alma", "dop"]);
        for (const c of n.choices) expect(c.forms.length).toBeGreaterThan(1);
        expect(Object.keys(n.onAnswer)).toEqual(["alma"]);
        expect(Object.keys(n.onOther)).toEqual(["dop"]);
        expect(LESSON_A[n.onOther.dop].next).toBe(id); // the gentle correction asks again
      }
    }
  });

  test("the lesson walks from a_intro to parent_report whatever the child does", () => {
    function walk(id, seen = new Set()) {
      if (id === "parent_report") return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return refs(LESSON_A[id]).some((r) => walk(r, seen));
    }
    expect(walk("a_intro")).toBe(true);
    expect(walk("a_intro_again")).toBe(true);
    // Every branch out of a question ends in the lesson's finale.
    for (const id of ids.filter((i) => LESSON_A[i].kind === "question")) {
      for (const r of refs(LESSON_A[id])) expect(walk(r)).toBe(true);
    }
    expect(LESSON_A.a_bye.next).toBe("parent_report");
  });
});

describe("ACTIVITIES", () => {
  test("story entry mirrors the tale's constants", () => {
    const a = ACTIVITIES.story;
    expect(a.start).toBe("intro");
    expect(a.startAgain).toBe("intro_again");
    expect(a.finalIds).toBe(FINAL_IDS);
    expect(STORY[a.limitTarget]).toBeDefined();
    expect(a.gentle).toBe(false);
    expect(a.skills).toEqual(["count", "choice", "empathy", "rhyme"]);
  });
  test("letter-a entry points into LESSON_A and runs gentle", () => {
    const a = ACTIVITIES["letter-a"];
    expect(a.kind).toBe("lesson");
    expect(LESSON_A[a.start].kind).toBe("narration");
    expect(LESSON_A[a.startAgain].kind).toBe("narration");
    expect(LESSON_A[a.limitTarget]).toBeDefined();
    expect(a.finalIds.has(a.limitTarget)).toBe(true);
    expect(a.finalIds.has("parent_report")).toBe(true);
    expect(a.gentle).toBe(true);
    expect(a.title.length).toBeGreaterThan(0);
    expect(a.subtitleKk.length).toBeGreaterThan(0);
    expect(a.endLineKk.length).toBeGreaterThan(0);
  });
});

describe("destutter", () => {
  test("drops hyphens and collapses repeated chunks", () => {
    expect(destutter("а-а-а")).toBe("а");
    expect(destutter("ааа")).toBe("а");
    expect(destutter("ал-ал-ма")).toBe("алма");
    expect(destutter("тли-тли")).toBe("тли");
    expect(destutter("б-б-бір")).toBe("бір");
  });
  test("leaves ordinary words alone", () => {
    expect(destutter("алма")).toBe("алма");
    expect(destutter("яблоко")).toBe("яблоко");
    expect(destutter("доп")).toBe("доп");
  });
});

describe("imitate (local classifier)", () => {
  const sound = LESSON_A.q_a_sound;
  const alma = LESSON_A.q_a_alma;
  const ctx = {};
  test("a prolonged vowel in any spelling is the sound", () => {
    for (const t of ["а", "А-а-а", "ааа", "ах", "аа аа"]) {
      expect(localClassify(sound, t, ctx).label).toBe("correct");
    }
  });
  test("any word starting with the target sound passes (the lesson is about the sound)", () => {
    expect(localClassify(sound, "алма", ctx).label).toBe("correct");
    expect(localClassify(sound, "ана", ctx).label).toBe("correct");
    expect(localClassify(sound, "яблоко", ctx).label).toBe("correct");
  });
  test("no vowel [а] → unclear (a one-letter target gets no edit-distance slack)", () => {
    expect(localClassify(sound, "доп", ctx).label).toBe("unclear");
    expect(localClassify(sound, "", ctx).label).toBe("unclear");
    expect(localClassify(sound, "м-м", ctx).label).toBe("unclear");
    expect(localClassify(sound, "у", ctx).label).toBe("unclear");
    expect(localClassify(sound, "ох", ctx).label).toBe("unclear");
  });
  test("«алма» and its child forms, stuttered or not", () => {
    for (const t of ["алма", "ама", "альма", "ал-ал-ма", "яблоко", "ябоко", "алма-а"]) {
      expect(localClassify(alma, t, ctx).label).toBe("correct");
    }
    expect(matchesImitate(["доп"], alma)).toBe(false);
    expect(localClassify(alma, "мяч", ctx).label).toBe("unclear");
  });
});

describe("pick (local classifier)", () => {
  const pick = LESSON_A.q_a_pick;
  test("the right card → correct with its id", () => {
    const r = localClassify(pick, "алма", {});
    expect(r.label).toBe("correct");
    expect(r.choice).toBe("alma");
    expect(localClassify(pick, "это яблоко", {}).choice).toBe("alma");
  });
  test("the other card → other (not a failed attempt)", () => {
    const r = localClassify(pick, "доп", {});
    expect(r.label).toBe("other");
    expect(r.choice).toBe("dop");
    expect(localClassify(pick, "мяч", {}).label).toBe("other");
  });
  test("neither or both → unclear, no choice", () => {
    expect(localClassify(pick, "не знаю", {}).label).toBe("unclear");
    expect(localClassify(pick, "алма доп", {}).label).toBe("unclear");
    expect(detectChoice(["привет"], pick)).toBeNull();
  });
});

describe("open with accept list (q_a_ana)", () => {
  const ana = LESSON_A.q_a_ana;
  test("a short emotional word passes even though it is under the 3-letter noise filter", () => {
    expect(localClassify(ana, "ана", {}).label).toBe("correct");
    expect(localClassify(ana, "мам", {}).label).toBe("correct");
  });
  test("any real phrase passes; a bare filler does not", () => {
    expect(localClassify(ana, "анам жақсы", {}).label).toBe("correct");
    expect(localClassify(ana, "ну", {}).label).toBe("unclear");
  });
});

describe("parity with lib/stt-pick.js", () => {
  test("LESSON_A_FORMS is byte-identical to the story.js lists", async () => {
    const { LESSON_A_FORMS, destutter: serverDestutter, expectedForms, scoreTranscript } = await import("../lib/stt-pick.js");
    expect(LESSON_A_FORMS.sound).toEqual(LESSON_A_SOUND_FORMS);
    expect(LESSON_A_FORMS.alma).toEqual(LESSON_A_ALMA_FORMS);
    expect(LESSON_A_FORMS.pick).toEqual(LESSON_A_PICK_FORMS);
    expect(LESSON_A.q_a_sound.accept).toBe(LESSON_A_SOUND_FORMS);
    expect(LESSON_A.q_a_alma.accept).toBe(LESSON_A_ALMA_FORMS);
    for (const c of LESSON_A.q_a_pick.choices) expect(c.forms).toBe(LESSON_A_PICK_FORMS[c.id]);
    for (const w of ["а-а-а", "ал-ал-ма", "тли-тли", "алма", "яблоко", "б-б-бір"]) {
      expect(serverDestutter(w)).toBe(destutter(w));
    }
    // and the server scores the lesson nodes the way the client judges them
    expect(scoreTranscript("а-а-а", expectedForms("q_a_sound"))).toBe(1);
    expect(scoreTranscript("яблоко", expectedForms("q_a_sound"))).toBe(1); // starts with я
    expect(scoreTranscript("доп", expectedForms("q_a_sound"))).toBe(0);
    expect(scoreTranscript("ал-ал-ма", expectedForms("q_a_alma"))).toBe(1);
    expect(scoreTranscript("мяч", expectedForms("q_a_alma"))).toBe(0);
    expect(scoreTranscript("алма", expectedForms("q_a_pick"))).toEqual({ score: 1, route: "alma" });
    expect(scoreTranscript("мяч", expectedForms("q_a_pick"))).toEqual({ score: 1, route: "dop" });
    expect(scoreTranscript("алма доп", expectedForms("q_a_pick"))).toEqual({ score: 0.5, route: null });
    expect(expectedForms("q_a_ana").kind).toBe("empathy");
  });
});
