const { test, expect, describe, beforeEach } = require("bun:test");
const { Session, SESSION_LIMIT_MS } = require("../public/session.js");

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

beforeEach(() => {
  Session._storage = memStorage();
  Session.start(1000);
});

describe("summarize", () => {
  test("counts words, response time, first-try accuracy, skills, moments", () => {
    Session.questionShown("q_tracks", "count", 1, 1000);
    Session.answer({ nodeId: "q_tracks", transcript: "үш із", verdict: "correct", source: "ai", answeredAt: 3000 });
    Session.questionShown("q_fork", "choice", 1, 5000);
    Session.answer({ nodeId: "q_fork", transcript: "солға", verdict: "correct", source: "ai", route: "river", answeredAt: 6000 });
    Session.setRoute("river");
    Session.moment("жолды таңдады: өзен", 6000);
    Session.questionShown("q_courage", "empathy", 1, 9000);
    Session.answer({ nodeId: "q_courage", transcript: "ну", verdict: "unclear", source: "ai", answeredAt: 10000 });
    Session.questionShown("q_courage", "empathy", 2, 12000);
    Session.answer({ nodeId: "q_courage", transcript: "қорықпа мен қасыңдамын", verdict: "correct", source: "ai", answeredAt: 13000 });
    Session.questionShown("q_echo", "rhyme", 1, 15000);
    Session.answer({ nodeId: "q_echo", transcript: "үй", verdict: "unclear", source: "ai", answeredAt: 16000 });
    Session.questionShown("q_echo", "rhyme", 2, 18000);
    Session.answer({ nodeId: "q_echo", transcript: "жоқ", verdict: "reveal", source: "ai", answeredAt: 19000 });

    const s = Session.summarize(Session.current());
    // words shorter than 3 letters ("үш", "ну", "үй") are dropped as noise
    expect(s.words).toEqual(["солға", "қорықпа", "мен", "қасыңдамын", "жоқ"]);
    expect(s.avgResponseSec).toBeCloseTo((2 + 1 + 1 + 1) / 4, 5); // first attempts only
    expect(s.firstTryCorrect).toBe(2);
    expect(s.questionsTotal).toBe(4);
    expect(s.skills).toEqual({ count: "first", choice: "first", empathy: "reask", rhyme: "reveal" });
    expect(s.route).toBe("river");
    expect(s.moments).toEqual([{ atSec: 5, text_kk: "жолды таңдады: өзен" }]);
  });

  test("unanswered skill is 'skipped'", () => {
    const s = Session.summarize(Session.current());
    expect(s.skills.count).toBe("skipped");
    expect(s.avgResponseSec).toBeNull();
  });

  test("lesson session: skills come from the activity, tap answers are counted apart", () => {
    Session.start(1000, { activity: "letter-a", skills: ["sound_a", "word_a", "pick_a", "open_a"] });
    Session.questionShown("q_a_sound", "sound_a", 1, 1000);
    Session.answer({ nodeId: "q_a_sound", transcript: "а-а-а", verdict: "correct", source: "ai", answeredAt: 2000 });
    Session.questionShown("q_a_pick", "pick_a", 1, 3000);
    Session.answer({ nodeId: "q_a_pick", transcript: "👆 доп", verdict: "other", source: "tap", answeredAt: 4000 });
    Session.questionShown("q_a_pick", "pick_a", 1, 5000);
    Session.answer({ nodeId: "q_a_pick", transcript: "👆 алма", verdict: "correct", source: "tap", answeredAt: 6000 });
    const s = Session.summarize(Session.current());
    expect(Object.keys(s.skills).sort()).toEqual(["open_a", "pick_a", "sound_a", "word_a"]);
    expect(s.skills.count).toBeUndefined(); // the tale's rows never appear in a lesson
    expect(s.skills.sound_a).toBe("first");
    expect(s.skills.pick_a).toBe("reask"); // picked the other card first
    expect(s.skills.word_a).toBe("skipped");
    expect(s.gestureAnswers).toBe(2);
    expect(s.activity).toBe("letter-a");
    expect(s.questionsTotal).toBe(2);
  });

  test("answers judged by the adult (no network / mic) are counted apart", () => {
    Session.start(1000, { activity: "letter-a", skills: ["sound_a", "word_a", "pick_a", "open_a"] });
    Session.questionShown("q_a_sound", "sound_a", 1, 1000);
    Session.answer({ nodeId: "q_a_sound", transcript: "👂 ата-ана", verdict: "unclear", source: "adult", answeredAt: 3000 });
    Session.questionShown("q_a_sound", "sound_a", 2, 4000);
    Session.answer({ nodeId: "q_a_sound", transcript: "👂 ата-ана", verdict: "correct", source: "adult", answeredAt: 6000 });
    Session.questionShown("q_a_pick", "pick_a", 1, 7000);
    Session.answer({ nodeId: "q_a_pick", transcript: "👆 алма", verdict: "correct", source: "tap", answeredAt: 8000 });
    const s = Session.summarize(Session.current());
    expect(s.adultAnswers).toBe(2);
    expect(s.gestureAnswers).toBe(1);
    expect(s.skills.sound_a).toBe("reask");
    // nothing was heard: no «words», and the adult's tap delay is not a reaction time
    expect(s.words).toEqual([]); // «👂 ата-ана» and «👆 алма» are not speech
    expect(s.avgResponseSec).toBe(1); // only the child's own tap (1 s); the adult's 2 s is left out
  });

  test("shown but never answered (all verdicts null) is 'skipped'", () => {
    Session.questionShown("q_tracks", "count", 1, 1000);
    const s = Session.summarize(Session.current());
    expect(s.skills.count).toBe("skipped");
    expect(s.questionsTotal).toBe(0);
  });
});

describe("memory + history", () => {
  test("first run: runs=0", () => {
    expect(Session.memory()).toEqual({ runs: 0, lastRoute: null, lastPlayedAt: null, lessons: {} });
  });
  test("a lesson keeps its own replay counter, separate from the tale's runs", () => {
    Session.start(1000, { activity: "letter-a", skills: ["sound_a", "word_a"] });
    Session.finish({ completed: true }, 5000);
    expect(Session.memory().runs).toBe(0);
    expect(Session.lessonRuns("letter-a")).toBe(1);
    expect(Session.lessonRuns("letter-u")).toBe(0);
    Session.start(6000);
    Session.finish({ completed: true }, 7000);
    expect(Session.memory().runs).toBe(1);
    expect(Session.lessonRuns("letter-a")).toBe(1); // untouched by the tale
    expect(Session.history()[0].activity).toBe("story");
    expect(Session.history()[1].activity).toBe("letter-a");
  });
  test("legacy memory without `lessons` still reads", () => {
    Session._storage.setItem("ertegim.memory", JSON.stringify({ runs: 2, lastRoute: "river", lastPlayedAt: null }));
    expect(Session.memory().runs).toBe(2);
    expect(Session.lessonRuns("letter-a")).toBe(0);
  });
  test("finish completed increments runs and stores route", () => {
    Session.setRoute("forest");
    Session.finish({ completed: true }, 20000);
    expect(Session.memory().runs).toBe(1);
    expect(Session.memory().lastRoute).toBe("forest");
    expect(Session.history().length).toBe(1);
    expect(Session.history()[0].completed).toBe(true);
  });
  test("finish not completed does not increment runs but stores history", () => {
    Session.markBlocked();
    Session.finish({ completed: false }, 20000);
    expect(Session.memory().runs).toBe(0);
    expect(Session.history()[0].blocked).toBe(true);
  });
  test("history capped at 100, newest first", () => {
    for (let i = 0; i < 105; i++) {
      Session.start(i * 1000);
      Session.finish({ completed: true }, i * 1000 + 500);
    }
    const h = Session.history();
    expect(h.length).toBe(100);
    expect(new Date(h[0].date).getTime()).toBe(104000 + 500);
  });
  test("storage unavailable → memory silently empty", () => {
    Session._storage = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(Session.memory().runs).toBe(0);
    expect(() => Session.finish({ completed: true }, 5000)).not.toThrow();
  });
});

describe("overLimit", () => {
  test("false before 8 min, true after", () => {
    expect(Session.overLimit(1000 + SESSION_LIMIT_MS - 1)).toBe(false);
    expect(Session.overLimit(1000 + SESSION_LIMIT_MS + 1)).toBe(true);
  });
});
