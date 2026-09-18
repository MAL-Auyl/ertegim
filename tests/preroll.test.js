const { test, expect } = require("bun:test");
const { assembleClip, trimIdle, nextBuffer } = require("../public/preroll.js");

test("assembleClip keeps header + preroll + speech", () => {
  const c = ["H", "a", "b", "c", "d", "e", "f"];
  expect(assembleClip(c, 4, 2)).toEqual(["H", "b", "c", "d", "e", "f"]); // 2 pre-roll chunks = ~500ms, matches VAD_PREROLL_CHUNKS and trimIdle
});
test("assembleClip never duplicates the header when preroll reaches it", () => {
  expect(assembleClip(["H", "a", "b"], 1, 2)).toEqual(["H", "a", "b"]);
  expect(assembleClip(["H", "a", "b"], 0, 2)).toEqual(["H", "a", "b"]);
});
test("assembleClip with empty input", () => {
  expect(assembleClip([], 0, 2)).toEqual([]);
});
test("trimIdle keeps header and the last N chunks", () => {
  expect(trimIdle(["H", "a", "b", "c", "d"], 2)).toEqual(["H", "c", "d"]);
  expect(trimIdle(["H", "a"], 2)).toEqual(["H", "a"]);
  expect(trimIdle(["H"], 2)).toEqual(["H"]);
});

test("nextBuffer trims only while silent, and never after speech started", () => {
  // Header + silence: the buffer stays capped at header + 2 pre-roll chunks.
  let buf = [];
  for (const c of ["H", "a", "b", "c", "d"]) buf = nextBuffer(buf, c, false, 2);
  expect(buf).toEqual(["H", "c", "d"]);

  // Speech starts here; every later chunk is kept, including the final one
  // that MediaRecorder delivers after stop() (when vadRecording is already
  // false but vadSpoke is still true).
  for (const c of ["e", "f", "g"]) buf = nextBuffer(buf, c, true, 2);
  expect(buf).toEqual(["H", "c", "d", "e", "f", "g"]);
  buf = nextBuffer(buf, "tail-after-stop", true, 2);
  expect(buf).toEqual(["H", "c", "d", "e", "f", "g", "tail-after-stop"]);
  expect(assembleClip(buf, 3, 2)).toEqual(["H", "c", "d", "e", "f", "g", "tail-after-stop"]);
});
