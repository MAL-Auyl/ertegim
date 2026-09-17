// Per-game session state, the parent-report metrics derived from it, the
// hero's cross-session "memory" and the report history. Everything the
// report shows is computed here from what actually happened — nothing is
// hardcoded in the HTML any more.
//
// Privacy: full transcripts live only in the in-memory `raw` object for the
// duration of the game. What gets persisted is the summary (word tags,
// timings, verdict per skill) — never audio, never whole sentences.

const SESSION_LIMIT_MS = 8 * 60 * 1000;
const MEMORY_KEY = "ertegim.memory";
const HISTORY_KEY = "ertegim.sessions";
const HISTORY_MAX = 30;
const SKILLS = ["count", "choice", "empathy", "rhyme"];

let raw = null;

function emptyRaw(now) {
  return { startedAt: now, endedAt: null, route: null, blocked: false, completed: false, turns: [], moments: [] };
}

function safeStorage() {
  try {
    return Session._storage || (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
}

function readJson(key, fallback) {
  try {
    const st = safeStorage();
    if (!st) return fallback;
    const v = st.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    const st = safeStorage();
    if (st) st.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota — memory & history just stay off
  }
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'«»]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function summarize(r) {
  const words = [];
  for (const t of r.turns) {
    for (const w of tokenize(t.transcript)) if (!words.includes(w)) words.push(w);
  }

  const firstAttempts = r.turns.filter((t) => t.attempt === 1 && t.answeredAt != null);
  const avgResponseSec = firstAttempts.length
    ? firstAttempts.reduce((acc, t) => acc + (t.answeredAt - t.askedAt) / 1000, 0) / firstAttempts.length
    : null;

  const skills = {};
  for (const skill of SKILLS) {
    const turns = r.turns.filter((t) => t.skill === skill);
    if (turns.length === 0) { skills[skill] = "skipped"; continue; }
    const answered = turns.filter((t) => t.verdict !== null);
    if (answered.length === 0) { skills[skill] = "skipped"; continue; }
    const first = turns.find((t) => t.attempt === 1);
    if (first && first.verdict === "correct") { skills[skill] = "first"; continue; }
    skills[skill] = turns.some((t) => t.verdict === "reveal") ? "reveal" : "reask";
  }

  const askedSkills = SKILLS.filter((s) => skills[s] !== "skipped");
  const firstTryCorrect = askedSkills.filter((s) => skills[s] === "first").length;

  const end = r.endedAt ?? r.startedAt;
  return {
    date: new Date(end).toISOString(),
    durationSec: Math.round((end - r.startedAt) / 1000),
    route: r.route,
    completed: r.completed,
    blocked: r.blocked,
    words,
    avgResponseSec,
    firstTryCorrect,
    questionsTotal: askedSkills.length,
    skills,
    moments: r.moments.map((m) => ({ atSec: Math.round((m.at - r.startedAt) / 1000), text_kk: m.text_kk })),
  };
}

const Session = {
  _storage: null,

  start(now = Date.now()) {
    raw = emptyRaw(now);
  },

  current() {
    if (!raw) raw = emptyRaw(Date.now());
    return raw;
  },

  questionShown(nodeId, skill, attempt, now = Date.now()) {
    this.current().turns.push({ nodeId, skill, attempt, askedAt: now, answeredAt: null, transcript: "", verdict: null, source: null, route: null });
  },

  answer({ nodeId, transcript, verdict, source, route, answeredAt = Date.now() }) {
    const turns = this.current().turns;
    // The open turn for this node is the last one without a verdict.
    let t = null;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].nodeId === nodeId && turns[i].verdict === null) { t = turns[i]; break; }
    }
    if (!t) return;
    t.transcript = transcript || "";
    t.verdict = verdict;
    t.source = source || null;
    t.route = route || null;
    t.answeredAt = answeredAt;
  },

  setRoute(route) { this.current().route = route; },
  markBlocked() { this.current().blocked = true; },
  moment(text_kk, now = Date.now()) { this.current().moments.push({ at: now, text_kk }); },

  overLimit(now = Date.now()) {
    return now - this.current().startedAt > SESSION_LIMIT_MS;
  },

  summarize,

  memory() {
    const m = readJson(MEMORY_KEY, null);
    return m && typeof m.runs === "number" ? m : { runs: 0, lastRoute: null, lastPlayedAt: null };
  },

  history() {
    const h = readJson(HISTORY_KEY, []);
    return Array.isArray(h) ? h : [];
  },

  finish({ completed }, now = Date.now()) {
    const r = this.current();
    r.endedAt = now;
    r.completed = Boolean(completed);
    const summary = summarize(r);

    if (r.completed) {
      const m = this.memory();
      writeJson(MEMORY_KEY, { runs: m.runs + 1, lastRoute: r.route, lastPlayedAt: summary.date });
    }
    const history = [summary, ...this.history()].slice(0, HISTORY_MAX);
    writeJson(HISTORY_KEY, history);
    return summary;
  },
};

if (typeof module !== "undefined") {
  module.exports = { Session, SESSION_LIMIT_MS };
}
