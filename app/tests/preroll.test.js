const { test, expect } = require("bun:test");
const { assembleClip, trimIdle } = require("../public/preroll.js");

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
