// Fuzzy blocklist checker for Ертегім's automatic safety system.
// Whisper's Kazakh output is noisy (e.g. "ойыншық" -> "ойынчық"), so exact
// substring matching misses real triggers. This does word-level Levenshtein
// matching instead: a trigger word "hits" if ANY word in the transcript is
// within an edit-distance tolerance scaled to word length.
//
// The actual matching logic lives in ./blocklist-core.js (shared with
// api/transcribe.js's Vercel Edge deployment) — this file just adds the
// Bun-only CLI entry point on top.
//
// Usage: bun spike/blocklist.js "<transcript text>"
// Or import { checkBlocklist } from "./blocklist.js" in the real pipeline.
import { checkBlocklist, levenshtein, normalize } from "./blocklist-core.js";

// CLI entry point
if (import.meta.main) {
  const transcript = process.argv[2];
  if (!transcript) {
    console.error('Usage: bun spike/blocklist.js "<transcript text>"');
    process.exit(1);
  }
  const result = checkBlocklist(transcript);
  console.log(result.blocked ? "BLOCKED" : "clean");
  for (const r of result.results) {
    console.log(`  trigger: "${r.trigger}" (${(r.ratio * 100).toFixed(0)}% word match)`);
    for (const m of r.matches) {
      console.log(`    "${m.word}" -> ${m.hit ? `"${m.matched}" (dist=${m.dist})` : "no match"}`);
    }
  }
}

export { checkBlocklist, levenshtein, normalize };
