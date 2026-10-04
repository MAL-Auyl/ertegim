const { test, expect, describe, beforeEach } = require("bun:test");
const { Profiles, DEFAULT_PROFILE_ID, normalizeSettings } = require("../public/profiles.js");
const { Session } = require("../public/session.js");
const { Stickers } = require("../public/stickers.js");

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

let st;
beforeEach(() => {
  st = memStorage();
  Profiles._storage = st;
  Session._storage = st;
  Stickers._storage = st;
  // profiles.js caches the state in a module variable when storage is empty;
  // a fresh storage must start from the stored (empty) state again.
  st.setItem("ertegim.profiles", JSON.stringify({ list: [{ id: "default", name: "Бала", settings: {}, createdAt: "2026-10-01T00:00:00.000Z" }], activeId: "default" }));
  globalThis.Profiles = Profiles; // what the classic <script> world looks like to session.js / stickers.js
});

describe("profiles", () => {
  test("first use → one default profile named «Бала», active, using the legacy keys", () => {
    const p = Profiles.active();
    expect(p.id).toBe(DEFAULT_PROFILE_ID);
    expect(p.name).toBe("Бала");
    expect(Profiles.scopedKey("ertegim.sessions")).toBe("ertegim.sessions");
  });

  test("add / update / setActive / remove", () => {
    const a = Profiles.add({ name: "  Айгерім ", age: 5, notes: "ЗРР", settings: { gentle: true, maxReasks: 3, keepTranscripts: true, assigned: ["letter-a"] } }, 1000);
    expect(a.name).toBe("Айгерім");
    expect(Profiles.active().id).toBe(a.id); // a new child becomes active
    expect(Profiles.scopedKey("ertegim.sessions")).toBe(`ertegim.sessions:${a.id}`);
    expect(Profiles.settings()).toEqual({ gentle: true, maxReasks: 3, silenceMs: null, silenceTimeoutMs: null, keepTranscripts: true, assigned: ["letter-a"], judge: "auto" });

    const u = Profiles.update(a.id, { name: "Айгерим", settings: { maxReasks: 2, silenceMs: 4000 } });
    expect(u.name).toBe("Айгерим");
    expect(u.settings.maxReasks).toBe(2);
    expect(u.settings.silenceMs).toBe(4000);
    expect(u.settings.gentle).toBe(true); // untouched fields survive a partial patch

    expect(Profiles.setActive("default")).toBe(true);
    expect(Profiles.setActive("nope")).toBe(false);
    expect(Profiles.list().map((p) => p.id)).toEqual(["default", a.id]);

    st.setItem(`ertegim.sessions:${a.id}`, "[1]");
    expect(Profiles.remove(a.id)).toBe(true);
    expect(st.getItem(`ertegim.sessions:${a.id}`)).toBeNull(); // scoped data goes with the profile
    expect(Profiles.remove("default")).toBe(false); // never the last one
  });

  test("settings are validated, out-of-range values fall back to «no override»", () => {
    expect(normalizeSettings({ maxReasks: 7, silenceMs: 50, silenceTimeoutMs: 999999, gentle: "yes", keepTranscripts: "1", assigned: "x" }))
      .toEqual({ gentle: null, maxReasks: null, silenceMs: null, silenceTimeoutMs: null, keepTranscripts: false, assigned: [], judge: "auto" });
    expect(normalizeSettings({ judge: "adult" }).judge).toBe("adult");
    expect(normalizeSettings({ judge: "robot" }).judge).toBe("auto");
    expect(normalizeSettings(null).assigned).toEqual([]);
  });

  test("corrupt or missing storage still yields a usable profile", () => {
    st.setItem("ertegim.profiles", "{broken");
    expect(Profiles.active().name).toBe("Бала");
    Profiles._storage = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(Profiles.active().id).toBe(DEFAULT_PROFILE_ID);
  });
});

describe("per-child scoping of session history, memory and stickers", () => {
  test("each child has their own history, memory and stickers", () => {
    Session.start(1000);
    Session.finish({ completed: true }, 2000);
    Stickers.award(["fox"]);
    expect(Session.history().length).toBe(1);
    expect(Session.memory().runs).toBe(1);
    expect(Stickers.has("fox")).toBe(true);

    Profiles.add({ name: "Second" }, 3000);
    expect(Session.history().length).toBe(0);
    expect(Session.memory().runs).toBe(0);
    expect(Stickers.has("fox")).toBe(false);
    Session.start(4000, { activity: "letter-a", skills: ["sound_a"] });
    Session.finish({ completed: true }, 5000);
    expect(Session.lessonRuns("letter-a")).toBe(1);

    Profiles.setActive("default");
    expect(Session.history().length).toBe(1);
    expect(Session.lessonRuns("letter-a")).toBe(0);
    expect(Stickers.has("fox")).toBe(true);
  });
});

describe("attempt transcripts (opt-in)", () => {
  test("off by default: no attempts in the summary", () => {
    Session.start(1000, { profileId: "default" });
    Session.questionShown("q_tracks", "count", 1, 1000);
    Session.answer({ nodeId: "q_tracks", transcript: "үш із бар", verdict: "correct", source: "ai", answeredAt: 3000 });
    const s = Session.finish({ completed: true }, 4000);
    expect(s.attempts).toBeUndefined();
    expect(s.profileId).toBe("default");
    expect(JSON.stringify(Session.history()[0])).not.toContain("үш із бар");
  });
  test("on: every answered attempt is kept with its transcript, verdict, source and response time", () => {
    Session.start(1000, { keepTranscripts: true });
    Session.questionShown("q_tracks", "count", 1, 1000);
    Session.answer({ nodeId: "q_tracks", transcript: "екі", verdict: "unclear", source: "ai", answeredAt: 2500 });
    Session.questionShown("q_tracks", "count", 2, 3000);
    Session.answer({ nodeId: "q_tracks", transcript: "үш", verdict: "correct", source: "оператор", answeredAt: 4200 });
    Session.questionShown("q_fork", "choice", 1, 5000); // never answered → not an attempt
    const s = Session.finish({ completed: false }, 6000);
    expect(s.attempts).toEqual([
      { nodeId: "q_tracks", skill: "count", attempt: 1, transcript: "екі", verdict: "unclear", source: "ai", responseSec: 1.5 },
      { nodeId: "q_tracks", skill: "count", attempt: 2, transcript: "үш", verdict: "correct", source: "оператор", responseSec: 1.2 },
    ]);
    expect(Session.history()[0].attempts.length).toBe(2);
  });
});
