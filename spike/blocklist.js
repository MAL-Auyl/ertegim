#!/usr/bin/env bun
// Fuzzy blocklist checker for Ертегім's automatic safety system.
// Whisper's Kazakh output is noisy (e.g. "ойыншық" -> "ойынчық"), so exact
// substring matching misses real triggers. This does word-level Levenshtein
// matching instead: a trigger word "hits" if ANY word in the transcript is
// within an edit-distance tolerance scaled to word length.
//
// Usage: bun spike/blocklist.js "<transcript text>"
// Or import { checkBlocklist } from "./blocklist.js" in the real pipeline.

const TRIGGERS = [
  "маған ойыншық сатып бер", // "buy me a toy" — the scripted off-topic line
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()"'«»]/g, "")
    .trim();
}

// Tolerance scales with word length: short words need near-exact matches,
// longer words (more likely to get mangled by STT) tolerate more edits.
function tolerance(len) {
  // Kazakh STT commonly confuses single vowels/consonants (і/е, қ/к, ғ/г) —
  // even short words need at least 1 edit of slack, or garbled short words
  // never match anything.
  if (len <= 3) return 1;
  if (len <= 6) return 1;
  return Math.max(2, Math.floor(len * 0.3));
}

function wordFuzzyMatch(triggerWord, transcriptWords) {
  for (const tw of transcriptWords) {
    const dist = levenshtein(triggerWord, tw);
    if (dist <= tolerance(triggerWord.length)) return { hit: true, matched: tw, dist };
  }
  return { hit: false };
}

// A trigger phrase fires if at least `threshold` fraction of its words
// fuzzy-match somewhere in the transcript. Order-independent — STT word
// order under noise is not reliable enough to require it.
function checkBlocklist(transcript, triggers = TRIGGERS, threshold = 0.5) {
  const transcriptWords = normalize(transcript).split(/\s+/).filter(Boolean);
  const results = [];

  for (const trigger of triggers) {
    const triggerWords = normalize(trigger).split(/\s+/).filter(Boolean);
    const matches = triggerWords.map((tw) => ({
      word: tw,
      ...wordFuzzyMatch(tw, transcriptWords),
    }));
    const hitCount = matches.filter((m) => m.hit).length;
    const ratio = hitCount / triggerWords.length;
    // Require both a minimum ratio AND at least 2 matched words — guards
    // against a single common short word (e.g. "мен") accidentally firing
    // the block on an unrelated sentence.
    if (ratio >= threshold && hitCount >= 2) {
      results.push({ trigger, ratio, matches });
    }
  }

  return { blocked: results.length > 0, results };
}

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
