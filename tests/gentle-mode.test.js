// Source-level invariants on the gentle profile and the lesson wiring in
// public/app.js (a classic <script>, so not importable) — same approach as
// tests/vad-config.test.js.
const { test, expect } = require("bun:test");
const { readFileSync } = require("node:fs");

const SRC = readFileSync(`${__dirname}/../public/app.js`, "utf8");

function constant(name) {
  const m = SRC.match(new RegExp(`^const ${name} = ([0-9.]+);`, "m"));
  expect(m, `${name} not found in public/app.js`).toBeTruthy();
  return Number(m[1]);
}

function gentle(field) {
  const m = SRC.match(new RegExp(`const GENTLE_VAD = \\{[^}]*\\b${field}: ([0-9]+)`));
  expect(m, `GENTLE_VAD.${field} not found`).toBeTruthy();
  return Number(m[1]);
}

test("gentle profile only ever waits LONGER than the default and keeps the cap above the silence window", () => {
  expect(gentle("silenceMs")).toBeGreaterThan(constant("VAD_SILENCE_MS"));
  expect(gentle("silenceTimeoutMs")).toBeGreaterThan(constant("VAD_SILENCE_TIMEOUT_MS"));
  expect(gentle("maxRecordMs")).toBeGreaterThanOrEqual(constant("VAD_MAX_RECORD_MS"));
  expect(gentle("maxRecordMs")).toBeGreaterThan(gentle("silenceMs") + constant("VAD_MIN_SPEECH_MS"));
  expect(gentle("maxReasks")).toBe(2);
});

test("the VAD loop and the total-silence timer read the profile, not the raw constants", () => {
  // lastIndexOf: the same call also appears INSIDE vadLoop as its first line.
  const loop = SRC.slice(SRC.indexOf("function vadLoop"), SRC.lastIndexOf("vadFrameId = requestAnimationFrame(vadLoop)"));
  expect(loop).toContain("vadMaxRecordMs()");
  expect(loop).toContain("vadSilenceMs()");
  expect(loop).not.toMatch(/> VAD_SILENCE_MS\b/);
  const arm = SRC.slice(SRC.indexOf("function armVadForQuestion"), SRC.indexOf("function disarmVad"));
  expect(arm).toContain("vadSilenceTimeoutMs()");
});

test("re-asks are a counter bounded by maxReasks(), reset only on a new question", () => {
  expect(SRC).toMatch(/^let reaskCount = 0;/m);
  expect(SRC).not.toContain("reaskUsed");
  const body = SRC.slice(SRC.indexOf("function markReask"), SRC.indexOf("function markReask") + 900);
  expect(body).toContain("if (reaskCount < maxReasks())");
  expect(body).toContain("reaskCount++");
  expect(SRC).toContain("Session.questionShown(id, s.skill, reaskCount + 1)");
  expect(SRC).toMatch(/if \(activeQuestionId !== id\) \{\s*reaskCount = 0;/);
});

test("decoration checks calmMotion() (OS reduced-motion OR gentle), and gentle is a body class", () => {
  for (const fn of ["function burstSparkles", "function heroShake"]) {
    const body = SRC.slice(SRC.indexOf(fn), SRC.indexOf(fn) + 300);
    expect(body).toContain("calmMotion()");
  }
  expect(SRC).toContain('document.body.classList.toggle("gentle", gentleMode())');
  expect(SRC).toMatch(/ACTIVITY\.gentle \|\| gentleParam \|\| gentleOperator/);
});

test("the page runs one ACTIVITY over the merged node table", () => {
  // the fox tale, every letter lesson (LETTER_LESSONS) and every tale of TALES
  expect(SRC).toContain("const NODES = Object.assign({}, STORY, ...Object.values(LETTER_LESSONS).map((l) => l.nodes), ...Object.values(TALES).map((t) => t.nodes));");
  expect(SRC).not.toMatch(/\bSTORY\[/); // every id lookup goes through NODES
  expect(SRC).toContain("ACTIVITIES[pageParams.get(\"lesson\")] || ACTIVITIES.story");
  expect(SRC).toContain("ACTIVITY.finalIds.has(id)");
  expect(SRC).toMatch(/Session\.start\(Date\.now\(\), \{\s*activity: ACTIVITY\.id, skills: ACTIVITY\.skills,/);
});

test("a tapped picture card is a full answer with source \"tap\" and no mic", () => {
  const body = SRC.slice(SRC.indexOf("function onPictureTap"), SRC.indexOf("function onPictureTap") + 1200);
  expect(body).toContain("disarmVad()");
  expect(body).toContain('markCorrect("tap")');
  expect(body).toContain('markOther(choiceId, "tap")');
  // markOther never spends a re-ask
  const other = SRC.slice(SRC.indexOf("function markOther"), SRC.indexOf("function onPictureTap"));
  expect(other).not.toContain("reaskCount");
  expect(other).toContain('recordAnswer("other", source)');
});

test("a line with no audio at all is held for reading time instead of flashing past", () => {
  expect(SRC).toMatch(/function readingTimeMs/);
  const speak = SRC.slice(SRC.indexOf("async function speakLine"), SRC.indexOf("let mediaRecorder"));
  expect(speak.match(/await sleep\(readingTimeMs\(text\)\)/g)?.length).toBe(2);
});
