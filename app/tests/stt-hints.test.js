const { test, expect } = require("bun:test");

test("stt hints per node", async () => {
  const { sttHintFor, DEFAULT_HINT } = await import("../../spike/stt-hints-core.js");
  expect(sttHintFor("q_tracks")).toContain("бір, екі, үш, төрт, бес");
  expect(sttHintFor("q_tracks")).toContain("один, два, три, четыре, пять");
  expect(sttHintFor("q_fork")).toContain("солға");
  expect(sttHintFor("q_fork")).toContain("направо");
  expect(sttHintFor("q_courage")).toContain("қорықпа");
  expect(sttHintFor("q_echo", { brotherName: "мысық" })).toContain("мысық");
  expect(sttHintFor("q_echo", { brotherName: "мысық" })).toContain("қасық");
  expect(sttHintFor("q_echo")).toContain("балық"); // no name → still has the family
  expect(sttHintFor("intro")).toBe(DEFAULT_HINT);
  expect(sttHintFor(undefined)).toBe(DEFAULT_HINT);
  expect(sttHintFor("q_echo", { brotherName: "<script>" })).not.toContain("<");
});
