// Per-game session state, the parent-report metrics derived from it, the
// hero's cross-session "memory" and the report history. Everything the
// report shows is computed here from what actually happened — nothing is
// hardcoded in the HTML any more.
//
// Privacy: full transcripts live only in the in-memory `raw` object for the
// duration of the game. What gets persisted is the summary (word tags,
// timings, verdict per skill) — never audio, never whole sentences — UNLESS
// the active child profile has `keepTranscripts` on (the therapist's
// cabinet, profiles.js): then each attempt's transcript is kept too.
//
// All keys are scoped per child profile when profiles.js is loaded
// (Profiles.scopedKey); without it — one device-wide set, as before.

const SESSION_LIMIT_MS = 8 * 60 * 1000;
const MEMORY_KEY = "ertegim.memory";
const HISTORY_KEY = "ertegim.sessions";
// 100 sessions ≈ three months of daily practice; a therapist imports the
// home sessions on top of the clinic ones (homework.js mergeHistory).
const HISTORY_MAX = 100;
// Skills of the fox tale — the default when Session.start() is given no
// activity. A lesson passes its own list (see ACTIVITIES in story.js), so
// the report never shows the tale's rows for a letter lesson or vice versa.
const SKILLS = ["count", "choice", "empathy", "rhyme"];

let raw = null;

function emptyRaw(now, { activity = "story", skills = SKILLS, profileId = null, keepTranscripts = false } = {}) {
  return {
    startedAt: now, endedAt: null, activity, skills: [...skills], profileId, keepTranscripts: !!keepTranscripts,
    route: null, blocked: false, completed: false, turns: [], moments: [],
  };
}

function safeStorage() {
  try {
    return Session._storage || (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
}

function scoped(key) {
  try {
    return typeof Profiles !== "undefined" && Profiles.scopedKey ? Profiles.scopedKey(key) : key;
  } catch {
    return key;
  }
}

function readJson(key, fallback) {
  try {
    const st = safeStorage();
    if (!st) return fallback;
    const v = st.getItem(scoped(key));
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    const st = safeStorage();
    if (st) st.setItem(scoped(key), JSON.stringify(value));
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

// Answers that were not speech the recogniser heard: a tapped picture card
// («👆 алма»), a traced letter, or the adult's verdict («👂 ата-ана»). Their
// placeholder transcripts must not turn into «words the child said», and
// the adult's tap delay is not the child's reaction time.
const NOT_SPEECH = new Set(["tap", "trace", "adult"]);

function summarize(r) {
  const words = [];
  for (const t of r.turns) {
    if (NOT_SPEECH.has(t.source)) continue;
    for (const w of tokenize(t.transcript)) if (!words.includes(w)) words.push(w);
  }

  const firstAttempts = r.turns.filter((t) => t.attempt === 1 && t.answeredAt != null && t.source !== "adult");
  const avgResponseSec = firstAttempts.length
    ? firstAttempts.reduce((acc, t) => acc + (t.answeredAt - t.askedAt) / 1000, 0) / firstAttempts.length
    : null;

  const skillList = Array.isArray(r.skills) && r.skills.length ? r.skills : SKILLS;
  const skills = {};
  for (const skill of skillList) {
    const turns = r.turns.filter((t) => t.skill === skill);
    if (turns.length === 0) { skills[skill] = "skipped"; continue; }
    const answered = turns.filter((t) => t.verdict !== null);
    if (answered.length === 0) { skills[skill] = "skipped"; continue; }
    const first = turns.find((t) => t.attempt === 1);
    if (first && first.verdict === "correct") { skills[skill] = "first"; continue; }
    skills[skill] = turns.some((t) => t.verdict === "reveal") ? "reveal" : "reask";
  }

  const askedSkills = skillList.filter((s) => skills[s] !== "skipped");
  const firstTryCorrect = askedSkills.filter((s) => skills[s] === "first").length;
  // Answers given by tapping a picture card instead of speaking (lesson
  // "pick" nodes). A speech therapist reads this as a separate signal — the
  // child understood but did not vocalise — so the report shows it apart.
  const gestureAnswers = r.turns.filter((t) => t.verdict !== null && t.source === "tap").length;
  // Answers the adult judged by ear («Ата-ана бағалайды»: no network, no
  // mic, or the child's profile asks for it) — the recogniser heard nothing,
  // so the report says so instead of passing them off as recognised speech.
  const adultAnswers = r.turns.filter((t) => t.verdict !== null && t.source === "adult").length;

  // Per-attempt detail for the therapist's cabinet — only when the profile
  // asked for it (Session.keepTranscripts), see the privacy note above.
  const attempts = r.keepTranscripts
    ? r.turns.filter((t) => t.verdict !== null).map((t) => ({
        nodeId: t.nodeId, skill: t.skill, attempt: t.attempt,
        transcript: t.transcript || "", verdict: t.verdict, source: t.source,
        responseSec: t.answeredAt != null ? Math.round(((t.answeredAt - t.askedAt) / 1000) * 10) / 10 : null,
      }))
    : undefined;

  const end = r.endedAt ?? r.startedAt;
  return {
    date: new Date(end).toISOString(),
    activity: r.activity || "story",
    profileId: r.profileId || null,
    durationSec: Math.round((end - r.startedAt) / 1000),
    route: r.route,
    completed: r.completed,
    blocked: r.blocked,
    words,
    avgResponseSec,
    firstTryCorrect,
    questionsTotal: askedSkills.length,
    gestureAnswers,
    adultAnswers,
    skills,
    moments: r.moments.map((m) => ({ atSec: Math.round((m.at - r.startedAt) / 1000), text_kk: m.text_kk })),
    ...(attempts ? { attempts } : {}),
  };
}

const Session = {
  _storage: null,

  start(now = Date.now(), opts = {}) {
    raw = emptyRaw(now, opts);
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

  // `runs`/`lastRoute` are the fox tale's memory (intro vs intro_again).
  // Lessons keep their own counters under `lessons[<id>]` so a child who has
  // played the tale is still greeted as new by a lesson, and vice versa.
  memory() {
    const m = readJson(MEMORY_KEY, null);
    const base = m && typeof m.runs === "number" ? m : { runs: 0, lastRoute: null, lastPlayedAt: null };
    if (!base.lessons || typeof base.lessons !== "object") base.lessons = {};
    return base;
  },

  lessonRuns(lessonId) {
    const l = this.memory().lessons[lessonId];
    return l && typeof l.runs === "number" ? l.runs : 0;
  },

  history() {
    const h = readJson(HISTORY_KEY, []);
    return Array.isArray(h) ? h : [];
  },

  // Replaces the active child's history — used by the cabinet's import of
  // sessions played at home (already merged and sorted by the caller).
  replaceHistory(list) {
    writeJson(HISTORY_KEY, (Array.isArray(list) ? list : []).slice(0, HISTORY_MAX));
  },

  finish({ completed }, now = Date.now()) {
    const r = this.current();
    r.endedAt = now;
    r.completed = Boolean(completed);
    const summary = summarize(r);

    if (r.completed) {
      const m = this.memory();
      if (r.activity && r.activity !== "story") {
        const prev = this.lessonRuns(r.activity);
        m.lessons[r.activity] = { runs: prev + 1, lastPlayedAt: summary.date };
        writeJson(MEMORY_KEY, m);
      } else {
        writeJson(MEMORY_KEY, { ...m, runs: m.runs + 1, lastRoute: r.route, lastPlayedAt: summary.date });
      }
    }
    const history = [summary, ...this.history()].slice(0, HISTORY_MAX);
    writeJson(HISTORY_KEY, history);
    return summary;
  },
};

if (typeof module !== "undefined") {
  module.exports = { Session, SESSION_LIMIT_MS, HISTORY_MAX };
}
