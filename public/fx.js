// Pure helpers for the child-facing feedback effects (see app.js).
// Kept free of DOM/audio so they can be unit-tested (tests/fx.test.js).

// Sparkle burst geometry: `count` vectors spread evenly around the hero with
// a little jitter, each 42–88px out. Even spread beats pure randomness here —
// random angles clump, and a clumped burst reads as a glitch rather than a
// small celebration.
function sparkleVectors(count, rand = Math.random) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.7;
    const dist = 42 + rand() * 46;
    out.push({
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist),
    });
  }
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { sparkleVectors };
}
