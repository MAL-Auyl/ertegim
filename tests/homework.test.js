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
