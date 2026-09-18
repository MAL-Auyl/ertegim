const { test, expect } = require("bun:test");
const { sparkleVectors } = require("../public/fx.js");

test("sparkleVectors returns one vector per sparkle", () => {
  expect(sparkleVectors(12, () => 0.5)).toHaveLength(12);
  expect(sparkleVectors(0, () => 0.5)).toEqual([]);
});

test("every sparkle lands within the intended 42-88px ring", () => {
  let n = 0;
  const rand = () => ((n = (n + 0.37) % 1), n); // deterministic, spans the range
  for (const { dx, dy } of sparkleVectors(14, rand)) {
    const d = Math.hypot(dx, dy);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(90);
  }
});

test("sparkles spread around the hero instead of clumping", () => {
  const vs = sparkleVectors(8, () => 0.5); // no jitter: evenly spaced
  expect(vs.some((v) => v.dx > 0)).toBe(true);
  expect(vs.some((v) => v.dx < 0)).toBe(true);
  expect(vs.some((v) => v.dy > 0)).toBe(true);
  expect(vs.some((v) => v.dy < 0)).toBe(true);
});
