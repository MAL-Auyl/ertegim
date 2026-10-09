const { test, expect, describe } = require("bun:test");
const H = require("../public/hints.js");
const S = require("../public/story.js");

const ALL = Object.assign({}, S.STORY, ...Object.values(S.LETTER_LESSONS).map((l) => l.nodes), ...Object.values(S.TALES).map((t) => t.nodes));
const QUESTIONS = Object.entries(ALL).filter(([, n]) => n.kind === "question");

describe("which visual hint a question gets", () => {
  test("pick → highlight, counting → count, say-this → model; open, fork and rhyme → none", () => {
    expect(H.visualSupportKind(ALL.q_a_pick)).toBe("highlight");
    expect(H.visualSupportKind(ALL.q_bh_bees)).toBe("count");
    expect(H.visualSupportKind(ALL.q_tracks)).toBe("count");
    expect(H.visualSupportKind(ALL.q_plus)).toBe("count");
    expect(H.visualSupportKind(ALL.q_a_sound)).toBe("model");
    expect(H.visualSupportKind(ALL.q_letter_a)).toBe("model");
    for (const id of ["q_fork", "q_courage", "q_echo", "q_a_ana", "q_os_wish"]) expect(H.visualSupportKind(ALL[id])).toBeNull();
    expect(H.visualSupportKind(ALL.a_intro)).toBeNull(); // not a question
  });

  test("every imitation question carries a syllable model, every pick a right card", () => {
    for (const [id, n] of QUESTIONS) {
      if (n.mode === "imitate") {
        expect(n.model, id).toBeTruthy();
        expect(H.visualSupportKind(n), id).toBe("model");
      }
      if (n.mode === "pick") expect(Object.keys(n.onAnswer).length, id).toBe(1);
    }
    expect(QUESTIONS.filter(([, n]) => H.visualSupportKind(n)).length).toBeGreaterThanOrEqual(25);
  });
});

describe("the ladder", () => {
  test("the visual hint comes only on the last try before the reveal", () => {
    const n = ALL.q_a_pick;
    // default ladder (1 re-ask): try 1 plain, try 2 visual, then reveal
    expect(H.visualSupportNow(n, 0, 1)).toBeNull();
    expect(H.visualSupportNow(n, 1, 1)).toBe("highlight");
    // gentle (2 re-asks): words first, picture on the third try
    expect(H.visualSupportNow(n, 1, 2)).toBeNull();
    expect(H.visualSupportNow(n, 2, 2)).toBe("highlight");
    expect(H.visualSupportNow(ALL.q_fork, 1, 1)).toBeNull();
  });

  test("a skill the hero had to show last time gets one more step, up to three", () => {
    const hist = [
      { skills: { pick_a: "skipped", sound_a: "first" } },
      { skills: { pick_a: "reveal" } },
      { skills: { pick_a: "first" } },
    ];
    expect(H.recentSkillStates(hist, "pick_a")).toEqual(["reveal", "first"]);
    expect(H.recentSkillStates([], "pick_a")).toEqual([]);
    expect(H.adaptiveMaxReasks(1, ["reveal", "first"])).toBe(2);
    expect(H.adaptiveMaxReasks(2, ["reveal"])).toBe(3);
    expect(H.adaptiveMaxReasks(3, ["reveal"])).toBe(3);
    expect(H.adaptiveMaxReasks(2, ["first", "first"])).toBe(2); // never shorter than the mode's default
    expect(H.adaptiveMaxReasks(1, ["reask"])).toBe(1);
    expect(H.adaptiveMaxReasks(undefined, [])).toBe(1);
  });
});

describe("session and engine wiring", () => {
  test("tries with a visual hint are counted apart in the summary", () => {
    const { Session } = require("../public/session.js");
    Session.start(1000, { activity: "letter-a", skills: ["pick_a"] });
    Session.questionShown("q_a_pick", "pick_a", 1, 1000);
    Session.answer({ nodeId: "q_a_pick", transcript: "", verdict: "unclear", source: "ai", answeredAt: 2000 });
    Session.questionShown("q_a_pick", "pick_a", 2, 3000, { support: "highlight" });
    Session.answer({ nodeId: "q_a_pick", transcript: "👆 алма", verdict: "correct", source: "tap", answeredAt: 4000 });
    const s = Session.summarize(Session.current());
    expect(s.visualHints).toBe(1);
    expect(s.skills.pick_a).toBe("reask");
  });

  test("app.js uses the per-question ladder, not the global default, for the reveal", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../public/app.js"), "utf8");
    const reask = src.slice(src.indexOf("function markReask"), src.indexOf("function routeFromVerdict"));
    expect(reask).toContain("reaskCount < questionMaxReasks");
    expect(reask).not.toContain("maxReasks()");
    expect(src).toContain("Hints.adaptiveMaxReasks(maxReasks(), recent)");
    expect(src).toContain("applyVisualSupport(id, s, support)");
    const html = require("fs").readFileSync(require("path").join(__dirname, "../public/story.html"), "utf8");
    expect(html.indexOf('<script src="hints.js">')).toBeLessThan(html.indexOf('<script src="app.js">'));
  });
});
