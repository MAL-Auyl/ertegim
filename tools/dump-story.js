#!/usr/bin/env node
// Prints { audioId: kazakhText } for every line tools/prerender.py must
// synthesise. story.js is a classic browser script with a module.exports
// tail, so a plain require() works here.
const path = require("path");
const { STORY, LESSON_A, trackLines, echoLines, BROTHER_NAMES } = require(path.join(__dirname, "..", "public", "story.js"));

const out = {};
for (const [id, node] of Object.entries(STORY)) {
  if (!node.kk) continue;
  if (id === "tracks_reveal" || id === "q_echo") continue; // dynamic, variants below
  out[id] = node.kk;
}
// Letter lesson lines: ids are prefixed (a_* / q_a_*), so they share the flat
// public/audio/ directory with the tale without collisions.
for (const [id, node] of Object.entries(LESSON_A)) {
  if (node.kk) out[id] = node.kk;
}
for (let n = 2; n <= 5; n++) out[`tracks_reveal_${n}`] = trackLines(n).revealKk;
for (const b of BROTHER_NAMES) out[`q_echo_${b.slug}`] = echoLines(b).kk;

process.stdout.write(JSON.stringify(out, null, 2));
