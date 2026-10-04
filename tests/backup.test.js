const { test, expect, describe, beforeEach } = require("bun:test");
const { Backup } = require("../public/backup.js");
const { ErrLog, ERRLOG_MAX } = require("../public/errlog.js");

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

const DAY = 86400000;

describe("device backup", () => {
  const seed = () => memStorage({
    "ertegim.profiles": JSON.stringify({ list: [{ id: "default", name: "Бала" }, { id: "p1", name: "Айгерім" }], activeId: "p1" }),
    "ertegim.sessions": JSON.stringify([{ date: "2026-10-01T10:00:00Z" }]),
    "ertegim.sessions:p1": JSON.stringify([{ date: "2026-10-02T10:00:00Z" }, { date: "2026-10-03T10:00:00Z" }]),
    "ertegim.stickers:p1": "{}",
    "other.app": "keep me",
  });

  test("collects every ertegim.* key and nothing else", () => {
    const b = Backup.collectBackup(seed(), Date.UTC(2026, 9, 4));
    expect(b.kind).toBe("device-backup");
    expect(Object.keys(b.keys).sort()).toEqual(["ertegim.profiles", "ertegim.sessions", "ertegim.sessions:p1", "ertegim.stickers:p1"]);
    expect(b.createdAt).toBe("2026-10-04T00:00:00.000Z");
  });

  test("round trip through JSON restores the same data and replaces the old", () => {
    const b = JSON.parse(JSON.stringify(Backup.collectBackup(seed())));
    const parsed = Backup.parseBackup(b);
    expect(Backup.describeBackup(parsed)).toEqual({ children: 2, sessions: 3 });
    const target = memStorage({ "ertegim.sessions": "[]", "ertegim.junk": "x", "other.app": "keep me" });
    expect(Backup.restoreBackup(target, parsed)).toBe(4);
    const d = target.dump();
    expect(d["ertegim.junk"]).toBeUndefined();
    expect(JSON.parse(d["ertegim.sessions:p1"]).length).toBe(2);
    expect(d["other.app"]).toBe("keep me");
  });

  test("rejects anything that is not a device backup", () => {
    expect(Backup.parseBackup(null)).toBeNull();
    expect(Backup.parseBackup({ app: "Ертегім", child: {}, sessions: [] })).toBeNull(); // a per-child export
    expect(Backup.parseBackup({ app: "Ертегім", kind: "device-backup", keys: { "evil.key": "x" } })).toBeNull();
    expect(Backup.parseBackup({ app: "Ертегім", kind: "device-backup", keys: { "ertegim.a": 5 } })).toBeNull();
  });

  test("reminder: only when there are sessions and no copy for 7 days", () => {
    const st = memStorage();
    const now = Date.UTC(2026, 9, 10);
    expect(Backup.backupAgeDays(st, now)).toBeNull();
    expect(Backup.needsBackup(st, false, now)).toBe(false);
    expect(Backup.needsBackup(st, true, now)).toBe(true);
    Backup.markBackup(st, now - 2 * DAY);
    expect(Backup.backupAgeDays(st, now)).toBe(2);
    expect(Backup.needsBackup(st, true, now)).toBe(false);
    Backup.markBackup(st, now - 8 * DAY);
    expect(Backup.needsBackup(st, true, now)).toBe(true);
    // the stamp itself is not part of a backup
    expect(Object.keys(Backup.collectBackup(st).keys)).toEqual([]);
  });
});

describe("error log", () => {
  beforeEach(() => { ErrLog._storage = memStorage(); });

  test("newest first, repeats counted, capped", () => {
    ErrLog.note("boom", { src: "app.js:1", now: 1000 });
    ErrLog.note("boom", { src: "app.js:1", now: 2000 });
    ErrLog.note("other", { now: 3000 });
    const l = ErrLog.list();
    expect(l.map((e) => e.msg)).toEqual(["other", "boom"]);
    expect(l[1].n).toBe(2);
    for (let i = 0; i < 50; i++) ErrLog.note(`e${i}`);
    expect(ErrLog.list().length).toBe(ERRLOG_MAX);
    expect(ErrLog.text("abc1234").split("\n")[0]).toContain("Ертегім abc1234");
    ErrLog.clear();
    expect(ErrLog.list()).toEqual([]);
  });

  test("empty messages are ignored, broken storage is survived", () => {
    ErrLog.note("");
    expect(ErrLog.list()).toEqual([]);
    ErrLog._storage = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(() => ErrLog.note("still fine")).not.toThrow();
    expect(ErrLog.list()).toEqual([]);
    ErrLog._storage = null;
  });
});
