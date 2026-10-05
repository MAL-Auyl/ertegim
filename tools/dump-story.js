#!/usr/bin/env node
// Prints { audioId: kazakhText } for every line tools/prerender.py must
// synthesise. story.js is a classic browser script with a module.exports
// tail, so a plain require() works here.
const path = require("path");
const { STORY, LETTER_LESSONS, TALES, trackLines, echoLines, BROTHER_NAMES } = require(path.join(__dirname, "..", "public", "story.js"));

const out = {};
for (const [id, node] of Object.entries(STORY)) {
  if (!node.kk) continue;
  if (id === "tracks_reveal" || id === "q_echo") continue; // dynamic, variants below
  out[id] = node.kk;
}
// Letter lesson lines: ids are prefixed (a_* / q_a_*, o_*, u_* …), so they
// share the flat public/audio/ directory with the tale without collisions.
for (const lesson of Object.values(LETTER_LESSONS)) {
  for (const [id, node] of Object.entries(lesson.nodes)) {
    if (node.kk) out[id] = node.kk;
  }
}
// Tales (TALES): same flat directory, prefixed ids (bh_*, os_*, fb_* …).
for (const tale of Object.values(TALES)) {
  for (const [id, node] of Object.entries(tale.nodes)) {
    if (node.kk) out[id] = node.kk;
  }
}
for (let n = 2; n <= 5; n++) out[`tracks_reveal_${n}`] = trackLines(n).revealKk;
for (const b of BROTHER_NAMES) out[`q_echo_${b.slug}`] = echoLines(b).kk;

process.stdout.write(JSON.stringify(out, null, 2));
