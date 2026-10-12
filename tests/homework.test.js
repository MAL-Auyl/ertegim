const { test, expect, describe } = require("bun:test");
const H = require("../public/homework.js");
const { ACTIVITIES } = require("../public/story.js");
const KNOWN = Object.keys(ACTIVITIES);

const plan = { activities: ["letter-a", "count", "letter-a"], perWeek: 3, note: "Айтуды қайталау — «а» дыбысы", from: "Логопед Асель", child: "Айгерім", pid: "p123", createdAt: "2026-10-03T08:00:00Z" };

describe("plan link", () => {
  test("round-trips Cyrillic text through a URL-safe hash", () => {
    const link = H.planLink("https://ertegim.vercel.app/", plan);
    expect(link.startsWith("https://ertegim.vercel.app/#hw=")).toBe(true);
    expect(link.split("#hw=")[1]).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = H.planFromHash(new URL(link).hash, KNOWN);
    expect(back.activities).toEqual(["letter-a", "count"]); // de-duplicated
    expect(back.note).toBe(plan.note);
    expect(back.from).toBe("Логопед Асель");
    expect(back.child).toBe("Айгерім");
    expect(back.pid).toBe("p123");
    expect(back.perWeek).toBe(3);
  });
  test("unknown activities dropped, empty plan rejected, garbage → null", () => {
    expect(H.normalizePlan({ ...plan, activities: ["zzz", "count"] }, KNOWN).activities).toEqual(["count"]);
    expect(H.normalizePlan({ ...plan, activities: ["zzz"] }, KNOWN)).toBeNull();
    expect(H.decodePlan("!!!")).toBeNull();
    expect(H.planFromHash("#other=1")).toBeNull();
    expect(H.normalizePlan({ ...plan, perWeek: 99 }).perWeek).toBe(3);
    expect(H.normalizePlan({ ...plan, note: "x".repeat(999) }).note.length).toBe(300);
  });
});

describe("week progress", () => {
  test("weekStart is Monday 00:00 local", () => {
    const thu = new Date(2026, 9, 8, 15, 30).getTime(); // Thu 8 Oct 2026
    const ws = new Date(H.weekStart(thu));
    expect(ws.getDay()).toBe(1);
    expect(ws.getDate()).toBe(5);
    expect(ws.getHours()).toBe(0);
    const sun = new Date(2026, 9, 11, 23, 0).getTime();
    expect(H.weekStart(sun)).toBe(ws.getTime());
  });
  test("counts only completed sessions of this week per activity", () => {
    const now = new Date(2026, 9, 8, 18, 0).getTime();
    const at = (d, h = 10) => new Date(2026, 9, d, h).toISOString();
    const history = [
      { date: at(8), activity: "letter-a", completed: true },
      { date: at(7), activity: "letter-a", completed: true },
      { date: at(6), activity: "letter-a", completed: false },
      { date: at(4), activity: "letter-a", completed: true }, // last week (Sun)
      { date: at(6), activity: "count", completed: true },
      { date: at(6), activity: "count", completed: true },
      { date: at(7), activity: "count", completed: true },
    ];
    const p = H.normalizePlan(plan, KNOWN);
    expect(H.weekProgress(p, history, now)).toEqual([
      { id: "letter-a", done: 2, target: 3, met: false },
      { id: "count", done: 3, target: 3, met: true },
    ]);
    expect(H.weekProgress(null, history, now)).toEqual([]);
  });
});

describe("import from the home device", () => {
  test("mergeHistory de-duplicates by date+activity, newest first, capped", () => {
    const a = [{ date: "2026-10-03T10:00:00.000Z", activity: "count" }, { date: "2026-10-01T10:00:00.000Z" }];
    const b = [{ date: "2026-10-03T10:00:00.000Z", activity: "count" }, { date: "2026-10-05T10:00:00.000Z", activity: "letter-a" }, { nope: 1 }, { date: "garbage" }];
    const m = H.mergeHistory(a, b);
    expect(m.map((s) => s.date.slice(0, 10))).toEqual(["2026-10-05", "2026-10-03", "2026-10-01"]);
    expect(H.mergeHistory(a, b, 2).length).toBe(2);
  });
  test("parseBundle accepts the cabinet's JSON export only", () => {
    const { exportBundle } = require("../public/cabinet.js");
    const raw = exportBundle({ id: "pHome", name: "Айгерім", linkedId: "p123", settings: {} }, [{ date: "2026-10-03T10:00:00.000Z", activity: "count", completed: true }], { star: "x" });
    const b = H.parseBundle(JSON.parse(JSON.stringify(raw)));
    expect(b.child).toEqual({ id: "pHome", linkedId: "p123", name: "Айгерім" });
    expect(b.sessions.length).toBe(1);
    expect(H.parseBundle({ app: "other", child: {}, sessions: [] })).toBeNull();
    expect(H.parseBundle(null)).toBeNull();
  });
  test("matchProfile: link id, then remote id, then name, else null", () => {
    const profiles = [{ id: "default", name: "Бала" }, { id: "p123", name: "Айгерім" }, { id: "p9", name: "Нұрлан", remoteId: "pHome2" }];
    expect(H.matchProfile(profiles, { linkedId: "p123", id: "x", name: "Other" }).id).toBe("p123");
    expect(H.matchProfile(profiles, { id: "pHome2", name: "x" }).id).toBe("p9");
    expect(H.matchProfile(profiles, { name: " нұрлан " }).id).toBe("p9");
    expect(H.matchProfile(profiles, { name: "Жаңа" })).toBeNull();
  });
});

describe("profiles keep the homework bridge fields", () => {
  test("update stores plan, linkedId and remoteId", () => {
    const { Profiles } = require("../public/profiles.js");
    const mem = {}; Profiles._storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
    const p = Profiles.add({ name: "Айгерім" }, 1000);
    const np = H.normalizePlan(plan, KNOWN);
    Profiles.update(p.id, { homework: np, linkedId: "p123", remoteId: "pHome" });
    const got = Profiles.get(p.id);
    expect(got.homework.activities).toEqual(["letter-a", "count"]);
    expect(got.linkedId).toBe("p123");
    expect(got.remoteId).toBe("pHome");
    Profiles.update(p.id, { homework: null });
    expect(Profiles.get(p.id).homework).toBeNull();
    Profiles._storage = null;
  });
});

describe("results link (home → therapist)", () => {
  const np = H.normalizePlan(plan, KNOWN); // issued 2026-10-03T08:00Z
  const home = { id: "pHome", linkedId: "p123", name: "Айгерім" };
  const s = (iso, activity, skills, extra = {}) => ({ date: iso, activity, skills, completed: true, durationSec: 210, avgResponseSec: 2.345, words: ["алма", "ана"], moments: [{ atSec: 3, text_kk: "x" }], attempts: [{ transcript: "секрет" }], ...extra });
  const history = [
    s("2026-10-06T10:00:00.000Z", "letter-a", { sound_a: "reveal", word_a: "first", pick_a: "first", open_a: "skipped" }, { visualHints: 2, gestureAnswers: 1, adultAnswers: 1, questionsTotal: 3, firstTryCorrect: 2 }),
    s("2026-10-04T10:00:00.000Z", "count", { count: "reask" }, { questionsTotal: 1, firstTryCorrect: 0 }),
    s("2026-10-01T10:00:00.000Z", "count", { count: "first" }), // before the plan
  ];

  test("carries the sessions since the plan, round-trips through the hash", () => {
    const link = H.resultsLink("https://ertegim.vercel.app/", H.resultsPayload(home, np, history, Date.parse("2026-10-07T09:00:00Z")));
    expect(link.startsWith("https://ertegim.vercel.app/cabinet.html#hwr=")).toBe(true);
    expect(link.split("#hwr=")[1]).toMatch(/^[A-Za-z0-9_-]+$/);
    const b = H.resultsFromHash(new URL(link).hash);
    expect(b.child).toEqual({ id: "pHome", linkedId: "p123", name: "Айгерім" });
    expect(b.round).toBe(np.createdAt);
    expect(b.sentAt).toBe("2026-10-07T09:00:00.000Z");
    expect(b.sessions.map((x) => x.date.slice(0, 10))).toEqual(["2026-10-06", "2026-10-04"]);
    const a = b.sessions[0];
    expect(a.skills).toEqual({ sound_a: "reveal", word_a: "first", pick_a: "first" }); // skipped stays home
    expect([a.questionsTotal, a.firstTryCorrect, a.visualHints, a.gestureAnswers, a.adultAnswers]).toEqual([3, 2, 2, 1, 1]);
    expect(a.avgResponseSec).toBe(2.3);
    expect(a.completed).toBe(true);
    expect(a.words).toEqual(["алма", "ана"]);
    expect(a.fromLink).toBe(true);
    // a session's attempt transcripts and moments never travel in the link
    const raw = Buffer.from(link.split("#hwr=")[1], "base64url").toString("utf8");
    expect(raw).not.toContain("секрет");
    expect(raw).not.toContain("text_kk");
    expect(a.attempts).toBeUndefined();
  });

  test("a pasted WhatsApp message with the link works; garbage → null", () => {
    const link = H.resultsLink("https://e.kz", H.resultsPayload(home, np, history));
    expect(H.resultsFromHash(`Ертегім: Айгерім — нәтижелер ${link}`).sessions.length).toBe(2);
    expect(H.resultsFromHash("#hwr=!!!")).toBeNull();
    expect(H.resultsFromHash("#hwr=" + Buffer.from('{"c":1}').toString("base64url"))).toBeNull();
    expect(H.resultsFromHash("#hw=abc")).toBeNull();
    expect(H.resultsFromHash("")).toBeNull();
  });

  test("first-try counts are recomputed from the skills, junk skills dropped", () => {
    const payload = { c: { id: "x" }, s: [{ d: "2026-10-06T10:00:00Z", a: "count", k: { count: "f", "<img>": "f", plus: "zz" }, q: 99, f: 99 }] };
    const b = H.resultsFromHash("#hwr=" + Buffer.from(JSON.stringify(payload)).toString("base64url"));
    expect(b.sessions[0].skills).toEqual({ count: "first" });
    expect([b.sessions[0].questionsTotal, b.sessions[0].firstTryCorrect]).toEqual([1, 1]);
  });

  test("at most HW_RESULTS_MAX sessions, newest first", () => {
    const many = Array.from({ length: 40 }, (_, i) => s(new Date(Date.parse("2026-10-04T00:00:00Z") + i * 3600e3).toISOString(), "count", { count: "first" }));
    const p = H.resultsPayload(home, np, [...many].reverse());
    expect(p.s.length).toBe(H.HW_RESULTS_MAX);
    expect(p.s[0].d).toBe(many[39].date);
  });

  test("the file export (with transcripts) wins over the link's short copy of the same session", () => {
    const short = H.resultsFromHash(new URL(H.resultsLink("https://e.kz", H.resultsPayload(home, np, history))).hash).sessions;
    const afterLink = H.mergeHistory([], short);
    const full = H.mergeHistory(afterLink, history);
    expect(full.length).toBe(3);
    expect(full[0].attempts).toBeDefined();
    expect(full[0].fromLink).toBeUndefined();
    // and the other way round: the link never replaces what is already full
    expect(H.mergeHistory(history, short)[0].attempts).toBeDefined();
  });

  test("profiles remember when results were sent / received", () => {
    const { Profiles } = require("../public/profiles.js");
    const mem = {}; Profiles._storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
    const p = Profiles.add({ name: "Айгерім" }, 1000);
    Profiles.update(p.id, { hwSentAt: "2026-10-07T09:00:00.000Z", hwReceivedAt: "nonsense" });
    expect(Profiles.get(p.id).hwSentAt).toBe("2026-10-07T09:00:00.000Z");
    expect(Profiles.get(p.id).hwReceivedAt).toBeNull();
    Profiles._storage = null;
  });
});
