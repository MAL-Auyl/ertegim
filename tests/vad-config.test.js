// public/app.js is a classic <script> full of DOM wiring, so it can't be
// imported here. These are source-level invariants on the VAD block: the
// thresholds were field-tuned on a real phone and the relationships between
// them (hysteresis, caps, the total-silence escape hatch) are what keep the
// mic from either self-triggering on room noise or staying armed forever.
// Cheap regression net for the next time someone nudges a number by feel.
const { test, expect } = require("bun:test");
const { readFileSync } = require("node:fs");

const SRC = readFileSync(`${__dirname}/../public/app.js`, "utf8");

function constant(name) {
  const m = SRC.match(new RegExp(`^const ${name} = ([0-9.]+);`, "m"));
  expect(m, `${name} not found in public/app.js`).toBeTruthy();
  return Number(m[1]);
}

test("VAD thresholds keep their hysteresis and ordering", () => {
  const start = constant("VAD_START_RMS");
  const silence = constant("VAD_SILENCE_RMS");
  // Speech must be LOUDER to start than to keep going, or the loop chatters
  // at the threshold and chops a turn into fragments.
  expect(silence).toBeLessThan(start);
  // The user's field values, measured on a phone: 0.02 and below
  // self-triggered on ambient noise under the phone's mic AGC.
  expect(start).toBeGreaterThanOrEqual(0.03);
});

test("VAD timers: a turn fits, a blip doesn't, and nothing runs unbounded", () => {
  const minSpeech = constant("VAD_MIN_SPEECH_MS");
  const silenceMs = constant("VAD_SILENCE_MS");
  const maxRecord = constant("VAD_MAX_RECORD_MS");
  // A child pauses mid-count («бір… екі…»); 1000 ms was cutting them off.
  expect(silenceMs).toBeGreaterThanOrEqual(1700);
  // The hard cap has to outlast one full end-of-turn silence window, or a
  // turn ends on the cap before the silence detector ever gets to decide.
  expect(maxRecord).toBeGreaterThan(silenceMs + minSpeech);
  // The pre-roll already carries the instant before the gate tripped, so the
  // blip filter can stay short enough to accept «да» / «екі».
  expect(minSpeech).toBeLessThanOrEqual(300);
});

test("the total-silence timeout is armed, cancelled on speech, and cancelled on disarm", () => {
  expect(constant("VAD_SILENCE_TIMEOUT_MS")).toBe(8000);
  // Armed where the mic is armed (which happens only after the hero's line
  // has ended), so the window measures the CHILD's silence.
  expect(SRC).toMatch(/vadSilenceTimer = setTimeout\(/);
  expect(SRC).toMatch(/markReask\("тишина \(авто\)"\)/);
  // Cancelled on speech start, on disarm (renderState's per-transition hook)
  // and when the turn finishes — a leaked timer would re-ask over the next
  // question's answer.
  for (const fn of ["function markVadSpeechStart", "function disarmVad", "function finishVadTurn"]) {
    const body = SRC.slice(SRC.indexOf(fn), SRC.indexOf(fn) + 400);
    expect(body).toContain("cancelVadSilenceTimer()");
  }
});

test("?operator=1 is accepted as an alias of ?op=1", () => {
  expect(SRC).toMatch(/get\("op"\) === "1" \|\| \w+\.get\("operator"\) === "1"/);
});
