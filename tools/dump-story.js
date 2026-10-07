#!/usr/bin/env node
// Prints { audioId: kazakhText } for every line tools/prerender.py must
// synthesise. story.js is a classic browser script with a module.exports
// tail, so a plain require() works here.
//
// --meta prints { audioId: { kk, character, lesson } } instead — who says
// the line (fox / owl / bear, for per-hero voices in
// tools/prerender_voicestudio.py) and whether it is a letter-lesson line
// (read slower for children with a speech delay).
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

if (process.argv.includes("--meta")) {
  const byId = Object.assign({}, STORY, ...Object.values(TALES).map((t) => t.nodes));
  const lessonIds = new Set(Object.values(LETTER_LESSONS).flatMap((l) => Object.keys(l.nodes)));
  for (const l of Object.values(LETTER_LESSONS)) Object.assign(byId, l.nodes);
  const nodeOf = (id) => byId[id] || (id.startsWith("tracks_reveal_") ? STORY.tracks_reveal : id.startsWith("q_echo_") ? STORY.q_echo : null);
  const meta = {};
  for (const [id, kk] of Object.entries(out)) {
    const node = nodeOf(id);
    meta[id] = { kk, character: (node && node.character) || "fox", lesson: lessonIds.has(id) };
  }
  process.stdout.write(JSON.stringify(meta, null, 2));
} else {
  process.stdout.write(JSON.stringify(out, null, 2));
}
