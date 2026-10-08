// The tale library (story.js TALES). Every tale — today's three and any
// added later — is held to the same contract here, so a new tale is "done"
// when this file passes: the graph always reaches the parent report, every
// line is voiced, every picture is drawn, the server knows every question
// (lib/tale-forms.js is regenerated), and the report, cabinet, stickers
// and library pick it up without code changes.
const { test, expect, describe } = require("bun:test");
const fs = require("fs");
const path = require("path");
const S = require("../public/story.js");
const { localClassify } = require("../public/classify-local.js");
const { buildTaleForms, render } = require("../tools/tale-forms.js");

const PUB = path.join(__dirname, "../public");
const refs = (n) => [
  n.next, n.onCorrect, n.onReask, n.onReveal,
  ...(n.onAnswer ? Object.values(n.onAnswer) : []),
  ...(n.onOther ? Object.values(n.onOther) : []),
].filter(Boolean);
const appJs = fs.readFileSync(path.join(PUB, "app.js"), "utf8");
const BUILTIN_PICTURES = Object.fromEntries([...appJs.matchAll(/^\s+([a-z_]+): \{ src: "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const allOtherIds = new Set([
  ...Object.keys(S.STORY),
  ...Object.values(S.LETTER_LESSONS).flatMap((l) => Object.keys(l.nodes)),
]);

test("lib/tale-forms.js is up to date (run: node tools/tale-forms.js)", () => {
  const onDisk = fs.readFileSync(path.join(__dirname, "../lib/tale-forms.js"), "utf8");
  expect(onDisk).toBe(render(buildTaleForms()));
});

test("the library has at least three extra tales and no id is shared", () => {
  expect(Object.keys(S.TALES).length).toBeGreaterThanOrEqual(3);
  const seen = new Set(allOtherIds);
  for (const t of Object.values(S.TALES)) {
    for (const id of Object.keys(t.nodes)) {
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  }
});

for (const [taleId, tale] of Object.entries(S.TALES)) {
  const nodes = tale.nodes;
  const ids = Object.keys(nodes);
  const act = S.ACTIVITIES[taleId];

  describe(`tale ${taleId}`, () => {
    test("activity entry and start/end nodes", () => {
      expect(act.kind).toBe("tale");
      expect(act.start).toBe(tale.start);
      expect(nodes[tale.start].kind).toBe("narration");
      expect(nodes[tale.startAgain].kind).toBe("narration");
      expect(nodes[tale.end].next).toBe("parent_report");
      expect(act.finalIds.has(tale.end)).toBe(true);
      expect(act.skills).toEqual(Object.keys(tale.skills));
      for (const f of ["title", "titleRu", "subtitleKk", "subtitleRu", "endLineKk", "cardDescRu"]) expect(tale[f], f).toBeTruthy();
      expect(fs.existsSync(path.join(PUB, tale.cover))).toBe(true);
    });

    test("ids carry the tale prefix; every reference resolves; every path reaches the report", () => {
      const re = new RegExp(`^(${tale.prefix}_|q_${tale.prefix}_)`);
      for (const id of ids) expect(id).toMatch(re);
      for (const id of ids) for (const r of refs(nodes[id])) expect([...ids, "parent_report"], `${id} → ${r}`).toContain(r);
      const walk = (id, seen = new Set()) => id === "parent_report" || (!seen.has(id) && (seen.add(id), refs(nodes[id]).some((r) => walk(r, seen))));
      expect(walk(tale.start)).toBe(true);
      expect(walk(tale.startAgain)).toBe(true);
      for (const id of ids.filter((i) => nodes[i].kind === "question")) for (const r of refs(nodes[id])) expect(walk(r)).toBe(true);
    });

    test("every node: a known hero and pose, a scene, both languages, voiced", () => {
      for (const id of ids) {
        const n = nodes[id];
        expect(["fox", "owl", "bear"]).toContain(n.character);
        expect(["idle", "talk", "happy", "confused", "think"]).toContain(n.pose);
        expect(["night", "river", "forest", "cave", "dawn", "lesson"]).toContain(n.bg);
        expect(n.kk.length).toBeGreaterThan(0);
        expect(n.ru.length).toBeGreaterThan(0);
        expect(fs.existsSync(path.join(PUB, "audio", `${id}.wav`)), `audio ${id}`).toBe(true);
      }
    });

    test("every picture used is drawn", () => {
      const pics = { ...BUILTIN_PICTURES, ...Object.fromEntries(Object.entries(tale.pictures || {}).map(([k, v]) => [k, v.src])) };
      const used = new Set();
      for (const n of Object.values(nodes)) {
        if (n.picture) used.add(n.picture);
        for (const c of n.choices || []) used.add(c.picture);
      }
      for (const p of used) {
        expect(pics[p], p).toBeDefined();
        expect(fs.existsSync(path.join(PUB, pics[p])), pics[p]).toBe(true);
      }
    });

    test("questions: one per skill, re-ask loops back, a criterion and a Whisper hint each", () => {
      const qs = ids.filter((id) => nodes[id].kind === "question");
      expect(qs.map((id) => nodes[id].skill)).toEqual(Object.keys(tale.skills));
      for (const id of qs) {
        const n = nodes[id];
        expect(["imitate", "pick", "open", "exact"]).toContain(n.mode);
        expect(n.criterion.length).toBeGreaterThan(40);
        expect(n.hint.length).toBeGreaterThan(3);
        expect(nodes[n.onReask].next).toBe(id);
        if (n.mode === "exact") {
          expect(n.count).toBeGreaterThanOrEqual(1);
          expect(n.overlay.items).toBe(n.count);
        }
        if (n.mode === "imitate") expect(n.accept.length).toBeGreaterThan(2);
        if (n.mode === "pick") {
          expect(n.choices.length).toBe(2);
          for (const other of Object.values(n.onOther)) expect(nodes[other].next).toBe(id);
        }
      }
    });

    test("the local classifier accepts each question's model answer and rejects silence", () => {
      for (const id of ids.filter((i) => nodes[i].kind === "question")) {
        const n = nodes[id];
        const ctx = { trackCount: n.count, numKk: S.NUM_KK, numRu: S.NUM_RU };
        let good;
        if (n.mode === "imitate" || n.mode === "open") good = n.accept[0];
        else if (n.mode === "exact") good = S.NUM_KK[n.count];
        else good = n.choices.find((c) => n.onAnswer[c.id]).forms[0];
        expect(localClassify(n, good, ctx).label, `${id}: «${good}»`).toBe("correct");
        expect(localClassify(n, "", ctx).label, `${id}: silence`).toBe("unclear");
        if (n.mode === "pick") {
          const other = n.choices.find((c) => !n.onAnswer[c.id]);
          expect(localClassify(n, other.forms[0], ctx)).toMatchObject({ label: "other", choice: other.id });
        }
        if (n.mode === "exact") expect(localClassify(n, S.NUM_KK[n.count === 1 ? 2 : 1], ctx).label).toBe("unclear");
      }
    });
  });
}

describe("server and app integration", () => {
  test("the server scores every tale question the way the client does", async () => {
    const { expectedForms, scoreTranscript } = await import("../lib/stt-pick.js");
    const { sttHintFor, DEFAULT_HINT } = await import("../lib/stt-hints-core.js");
    for (const tale of Object.values(S.TALES)) {
      for (const [id, n] of Object.entries(tale.nodes)) {
        if (n.kind !== "question") continue;
        expect(sttHintFor(id)).toBe(n.hint);
        expect(sttHintFor(id)).not.toBe(DEFAULT_HINT);
        const ef = expectedForms(id);
        if (n.mode === "exact") expect(scoreTranscript(S.NUM_KK[n.count], ef)).toBe(1);
        if (n.mode === "imitate") expect(scoreTranscript(n.accept[0], ef)).toBe(1);
        if (n.mode === "open") expect(ef.kind).toBe("empathy");
        if (n.mode === "pick") {
          for (const c of n.choices) expect(scoreTranscript(c.forms[0], ef)).toEqual({ score: 1, route: c.id });
        }
      }
    }
  });

  test("report rows, cabinet labels and stickers come from the registry", () => {
    const { SKILL_META } = require("../public/report.js");
    const { ACTIVITY_TITLES, SKILL_LABEL } = require("../public/cabinet.js");
    const { STICKER_CATALOG, stickersFor } = require("../public/stickers.js");
    for (const [id, t] of Object.entries(S.TALES)) {
      expect(ACTIVITY_TITLES[id]).toContain(t.titleRu);
      expect(STICKER_CATALOG[id]).toEqual(t.sticker);
      expect(fs.existsSync(path.join(PUB, t.sticker.img))).toBe(true);
      for (const [k, v] of Object.entries(t.skills)) {
        expect(SKILL_META[k]).toEqual({ icon: v.icon, name: v.kk });
        expect(SKILL_LABEL[k]).toBe(v.ru);
      }
      expect(stickersFor(id, { completed: true, questionsTotal: 5, firstTryCorrect: 2 })).toEqual([id]);
    }
    // tale stickers sit right after the fox tale's heroes on the shelf
    const order = Object.keys(STICKER_CATALOG);
    expect(order.indexOf("bear") + 1).toBe(order.indexOf(Object.keys(S.TALES)[0]));
  });

  test("the home page builds a card per tale and the engine merges every tale's nodes", () => {
    const index = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
    expect(index).toContain('id="taleRow"');
    expect(index).toContain("Object.entries(TALES)");
    expect(index.indexOf('<script src="story.js"></script>')).toBeLessThan(index.indexOf("Object.entries(TALES)"));
    expect(appJs).toContain("...Object.values(TALES).map((t) => t.nodes)");
  });
});
