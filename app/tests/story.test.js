const { test, expect } = require("bun:test");
const { STORY, START_STATE, START_STATE_AGAIN, trackLines, echoLines, BROTHER_NAMES, FINAL_IDS } = require("../public/story.js");

const ids = Object.keys(STORY);
const refs = (n) => [n.next, n.onCorrect, n.onReask, n.onReveal, ...(n.onAnswer ? Object.values(n.onAnswer) : [])].filter(Boolean);

test("every referenced node exists", () => {
  for (const id of ids) for (const r of refs(STORY[id])) expect(ids).toContain(r);
});

test("start states exist and are narration", () => {
  expect(STORY[START_STATE].kind).toBe("narration");
  expect(STORY[START_STATE_AGAIN].kind).toBe("narration");
});

test("every node has character, pose, bg, speaker", () => {
  for (const id of ids) {
    const n = STORY[id];
    if (n.kind === "end") continue;
    expect(["fox", "owl", "bear"]).toContain(n.character);
    expect(["idle", "talk", "happy", "confused", "think"]).toContain(n.pose);
    expect(["night", "river", "forest", "cave", "dawn"]).toContain(n.bg);
    expect(typeof n.speaker).toBe("string");
    expect(n.kk.length).toBeGreaterThan(0);
    expect(n.ru.length).toBeGreaterThan(0);
  }
});

test("questions have mode/skill/criterion and reask+reveal; exact/open have onCorrect, branch has onAnswer", () => {
  const qs = ids.filter((id) => STORY[id].kind === "question");
  expect(qs.sort()).toEqual(["q_courage", "q_echo", "q_fork", "q_tracks"]);
  for (const id of qs) {
    const n = STORY[id];
    expect(["exact", "open", "branch"]).toContain(n.mode);
    expect(["count", "choice", "empathy", "rhyme"]).toContain(n.skill);
    expect(n.criterion.length).toBeGreaterThan(10);
    expect(n.onReask).toBeDefined();
    expect(n.onReveal).toBeDefined();
    if (n.mode === "branch") expect(Object.keys(n.onAnswer).sort()).toEqual(["forest", "river"]);
    else expect(n.onCorrect).toBeDefined();
  }
});

test("reask nodes loop back to their question", () => {
  expect(STORY.tracks_reask.next).toBe("q_tracks");
  expect(STORY.fork_reask.next).toBe("q_fork");
  expect(STORY.courage_reask.next).toBe("q_courage");
  expect(STORY.echo_reask.next).toBe("q_echo");
});

test("both routes reach found → thanks → parent_report", () => {
  function walk(id, seen = new Set()) {
    if (id === "parent_report") return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return refs(STORY[id]).some((r) => walk(r, seen));
  }
  expect(walk("owl_meet")).toBe(true);
  expect(walk("bear_meet")).toBe(true);
  expect(STORY.found.next).toBe("thanks");
  expect(STORY.thanks.next).toBe("parent_report");
  expect(STORY.thanks_again.next).toBe("parent_report");
  expect([...FINAL_IDS].sort()).toEqual(["found", "parent_report", "thanks", "thanks_again"]);
});

test("trackLines builds count text and criterion", () => {
  const t = trackLines(4);
  expect(t.revealKk).toContain("бір, екі, үш, төрт");
  expect(t.revealKk).toContain("Төрт із");
  expect(t.revealRu).toContain("Четыре следа");
  expect(t.criterion).toContain("(4)");
});

test("echoLines uses brother name", () => {
  for (const b of BROTHER_NAMES) {
    const e = echoLines(b);
    expect(e.kk).toContain(b.kk);
    expect(e.ru).toContain(b.kkLower);
    expect(e.criterion).toContain(b.kkLower);
  }
});
