// Every letter lesson (story.js LETTER_LESSONS: «А», «О», «Ұ»): the same
// graph contract as tests/lesson.test.js checks for «А» alone, plus what the
// new lessons need to actually run — audio for every line, every picture
// drawn, the classifiers on both sides agreeing, and the report, cabinet
// and stickers knowing the new activities.
const { test, expect, describe } = require("bun:test");
const fs = require("fs");
const path = require("path");
const S = require("../public/story.js");
const { localClassify } = require("../public/classify-local.js");

const PUB = path.join(__dirname, "../public");
const refs = (n) => [
  n.next, n.onCorrect, n.onReask, n.onReveal,
  ...(n.onAnswer ? Object.values(n.onAnswer) : []),
  ...(n.onOther ? Object.values(n.onOther) : []),
].filter(Boolean);

// LESSON_PICTURES in app.js (not require()-able): id → src.
const appJs = fs.readFileSync(path.join(PUB, "app.js"), "utf8");
const PICTURES = Object.fromEntries([...appJs.matchAll(/^\s+([a-z_]+): \{ src: "([^"]+)"/gm)].map((m) => [m[1], m[2]]));

for (const [activityId, lesson] of Object.entries(S.LETTER_LESSONS)) {
  const nodes = lesson.nodes;
  const ids = Object.keys(nodes);
  const act = S.ACTIVITIES[activityId];

  describe(`${activityId} graph`, () => {
    test("ids are prefixed and never collide with the tale or another lesson", () => {
      const re = new RegExp(`^(${lesson.prefix}_|q_${lesson.prefix}_)`);
      for (const id of ids) {
        expect(id).toMatch(re);
        expect(S.STORY[id]).toBeUndefined();
        for (const [other, l] of Object.entries(S.LETTER_LESSONS)) if (other !== activityId) expect(l.nodes[id]).toBeUndefined();
      }
    });

    test("every reference resolves; every path ends in parent_report", () => {
      for (const id of ids) for (const r of refs(nodes[id])) expect([...ids, "parent_report"]).toContain(r);
      const walk = (id, seen = new Set()) => id === "parent_report" || (!seen.has(id) && (seen.add(id), refs(nodes[id]).some((r) => walk(r, seen))));
      expect(walk(act.start)).toBe(true);
      expect(walk(act.startAgain)).toBe(true);
      for (const id of ids.filter((i) => nodes[i].kind === "question")) for (const r of refs(nodes[id])) expect(walk(r)).toBe(true);
    });

    test("every node: fox, a known pose, the lesson scene, its letter, both languages, a drawn picture", () => {
      for (const id of ids) {
        const n = nodes[id];
        expect(n.character).toBe("fox");
        expect(["idle", "talk", "happy", "confused", "think"]).toContain(n.pose);
        expect(n.bg).toBe("lesson");
        expect(n.letter).toBe(lesson.letter);
        expect(n.kk.length).toBeGreaterThan(0);
        expect(n.ru.length).toBeGreaterThan(0);
        if (n.picture) expect(lesson.pictures).toContain(n.picture);
        for (const c of n.choices || []) expect(lesson.pictures).toContain(c.picture);
      }
      for (const pic of lesson.pictures) {
        expect(PICTURES[pic], pic).toBeDefined();
        expect(fs.existsSync(path.join(PUB, PICTURES[pic])), PICTURES[pic]).toBe(true);
      }
    });

    test("four questions: imitate, imitate, pick, open — with the re-ask ladder", () => {
      const qs = ids.filter((id) => nodes[id].kind === "question");
      expect(qs.map((id) => nodes[id].mode)).toEqual(["imitate", "imitate", "pick", "open"]);
      expect(qs.map((id) => nodes[id].skill)).toEqual(act.skills);
      for (const id of qs) {
        const n = nodes[id];
        expect(n.criterion.length).toBeGreaterThan(40);
        expect(nodes[n.onReask].next).toBe(id);
        expect(nodes[n.onReveal]).toBeDefined();
        if (n.mode === "pick") {
          expect(n.choices.length).toBe(2);
          expect(Object.keys(n.onAnswer).length).toBe(1);
          for (const other of Object.values(n.onOther)) expect(nodes[other].next).toBe(id);
          for (const c of n.choices) expect(c.forms.length).toBeGreaterThan(2);
        }
      }
    });

    test("activity entry: gentle lesson, its own start, finale and limit target", () => {
      expect(act.kind).toBe("lesson");
      expect(act.gentle).toBe(true);
      expect(nodes[act.start].kind).toBe("narration");
      expect(nodes[act.limitTarget]).toBeDefined();
      expect(act.finalIds.has(act.limitTarget)).toBe(true);
      expect(act.finalIds.has("parent_report")).toBe(true);
    });

    test("every line is voiced (public/audio/<id>.wav)", () => {
      for (const id of ids) expect(fs.existsSync(path.join(PUB, "audio", `${id}.wav`)), id).toBe(true);
    });
  });
}

describe("lesson «О»: local classifier", () => {
  const L = S.LESSON_O;
  test("sound: any [о] passes, [а]/[у] do not", () => {
    for (const t of ["о", "О-о-о", "ооо", "ох", "ой", "орман"]) expect(localClassify(L.q_o_sound, t, {}).label).toBe("correct");
    for (const t of ["а", "у", "м-м", ""]) expect(localClassify(L.q_o_sound, t, {}).label).toBe("unclear");
  });
  test("word «от» and «огонь»", () => {
    for (const t of ["от", "о-от", "огонь", "огонёк"]) expect(localClassify(L.q_o_ot, t, {}).label).toBe("correct");
    expect(localClassify(L.q_o_ot, "мысық", {}).label).toBe("unclear");
  });
  test("pick: fire is right, the cat is the gentle «other»", () => {
    expect(localClassify(L.q_o_pick, "от", {})).toMatchObject({ label: "correct", choice: "ot" });
    expect(localClassify(L.q_o_pick, "это огонь", {})).toMatchObject({ label: "correct", choice: "ot" });
    expect(localClassify(L.q_o_pick, "мысық", {})).toMatchObject({ label: "other", choice: "mysyq" });
    expect(localClassify(L.q_o_pick, "кошка", {})).toMatchObject({ label: "other", choice: "mysyq" });
    expect(localClassify(L.q_o_pick, "не знаю", {}).label).toBe("unclear");
  });
  test("open: a toy's name is enough", () => {
    expect(localClassify(L.q_o_toy, "доп", {}).label).toBe("correct");
    expect(localClassify(L.q_o_toy, "менің аюым бар", {}).label).toBe("correct");
  });
});

describe("lesson «Ұ»: local classifier", () => {
  const L = S.LESSON_U;
  test("sound: Kazakh ұ, Russian у and ү all pass, [а]/[о] do not", () => {
    for (const t of ["ұ", "Ұ-ұ-ұ", "у", "у-у-у", "ууу", "ух", "ұшақ"]) expect(localClassify(L.q_u_sound, t, {}).label).toBe("correct");
    for (const t of ["а", "о", "м-м", ""]) expect(localClassify(L.q_u_sound, t, {}).label).toBe("unclear");
  });
  test("word «ұшақ» in Kazakh or Russian spelling, and «самолёт»", () => {
    for (const t of ["ұшақ", "ушақ", "ушак", "ұ-шақ", "самолёт", "самолет"]) expect(localClassify(L.q_u_ushaq, t, {}).label).toBe("correct");
    expect(localClassify(L.q_u_ushaq, "алма", {}).label).toBe("unclear");
  });
  test("pick: the plane is right, the apple is the gentle «other»", () => {
    expect(localClassify(L.q_u_pick, "ұшақ", {})).toMatchObject({ label: "correct", choice: "ushaq" });
    expect(localClassify(L.q_u_pick, "самолёт", {})).toMatchObject({ label: "correct", choice: "ushaq" });
    expect(localClassify(L.q_u_pick, "алма", {})).toMatchObject({ label: "other", choice: "alma" });
    expect(localClassify(L.q_u_pick, "ұшақ алма", {}).label).toBe("unclear");
  });
});

describe("server picker parity (lib/stt-pick.js)", () => {
  test("LESSON_O_FORMS / LESSON_U_FORMS are byte-identical to the story.js lists", async () => {
    const { LESSON_O_FORMS, LESSON_U_FORMS } = await import("../lib/stt-pick.js");
    expect(LESSON_O_FORMS.sound).toEqual(S.LESSON_O_SOUND_FORMS);
    expect(LESSON_O_FORMS.ot).toEqual(S.LESSON_O_OT_FORMS);
    expect(LESSON_O_FORMS.pick).toEqual(S.LESSON_O_PICK_FORMS);
    expect(LESSON_U_FORMS.sound).toEqual(S.LESSON_U_SOUND_FORMS);
    expect(LESSON_U_FORMS.ushaq).toEqual(S.LESSON_U_USHAQ_FORMS);
    expect(LESSON_U_FORMS.pick).toEqual(S.LESSON_U_PICK_FORMS);
    expect(S.LESSON_O.q_o_sound.accept).toBe(S.LESSON_O_SOUND_FORMS);
    expect(S.LESSON_U.q_u_ushaq.accept).toBe(S.LESSON_U_USHAQ_FORMS);
    for (const c of S.LESSON_O.q_o_pick.choices) expect(c.forms).toBe(S.LESSON_O_PICK_FORMS[c.id]);
    for (const c of S.LESSON_U.q_u_pick.choices) expect(c.forms).toBe(S.LESSON_U_PICK_FORMS[c.id]);
  });
  test("the server scores the new nodes the way the client judges them", async () => {
    const { expectedForms, scoreTranscript } = await import("../lib/stt-pick.js");
    expect(scoreTranscript("о-о-о", expectedForms("q_o_sound"))).toBe(1);
    expect(scoreTranscript("а", expectedForms("q_o_sound"))).toBe(0);
    expect(scoreTranscript("огонь", expectedForms("q_o_ot"))).toBe(1);
    expect(scoreTranscript("от", expectedForms("q_o_pick"))).toEqual({ score: 1, route: "ot" });
    expect(scoreTranscript("кошка", expectedForms("q_o_pick"))).toEqual({ score: 1, route: "mysyq" });
    expect(expectedForms("q_o_toy").kind).toBe("empathy");
    expect(scoreTranscript("у-у-у", expectedForms("q_u_sound"))).toBe(1);
    expect(scoreTranscript("ұ", expectedForms("q_u_sound"))).toBe(1);
    expect(scoreTranscript("о", expectedForms("q_u_sound"))).toBe(0);
    expect(scoreTranscript("самолёт", expectedForms("q_u_ushaq"))).toBe(1);
    expect(scoreTranscript("ұшақ", expectedForms("q_u_pick"))).toEqual({ score: 1, route: "ushaq" });
    expect(scoreTranscript("яблоко", expectedForms("q_u_pick"))).toEqual({ score: 1, route: "alma" });
    expect(expectedForms("q_u_like").kind).toBe("empathy");
  });
  test("every new question has its own Whisper hint", async () => {
    const { sttHintFor, DEFAULT_HINT } = await import("../lib/stt-hints-core.js");
    for (const l of [S.LESSON_O, S.LESSON_U]) {
      for (const [id, n] of Object.entries(l)) if (n.kind === "question") expect(sttHintFor(id)).not.toBe(DEFAULT_HINT);
    }
  });
});

describe("the rest of the app knows the new lessons", () => {
  test("stickers, report rows, cabinet labels, library cards", () => {
    const { STICKER_CATALOG } = require("../public/stickers.js");
    const { SKILL_META } = require("../public/report.js");
    const { ACTIVITY_TITLES, SKILL_LABEL } = require("../public/cabinet.js");
    const index = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
    for (const id of Object.keys(S.LETTER_LESSONS)) {
      expect(STICKER_CATALOG[id], id).toBeDefined();
      expect(fs.existsSync(path.join(PUB, STICKER_CATALOG[id].img))).toBe(true);
      expect(ACTIVITY_TITLES[id], id).toBeDefined();
      expect(index).toContain(`/story.html?lesson=${id}"`);
      for (const sk of S.ACTIVITIES[id].skills) {
        expect(SKILL_META[sk], sk).toBeDefined();
        expect(SKILL_LABEL[sk], sk).toBeDefined();
      }
    }
  });
});
