// Judge story-set rows with the production picker (lib/stt-pick.js).
// stdin: JSON array of {node, ctx, want, candidates: [...]}; stdout: JSON array of results.
// lib/*.js is ESM syntax without "type": "module", so it is loaded from source.
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "lib", "stt-pick.js"), "utf8");
import("data:text/javascript," + encodeURIComponent(src)).then(({ expectedForms, pickTranscript }) => {
  const rows = JSON.parse(fs.readFileSync(0, "utf8"));
  const out = rows.map(({ node, ctx, want, candidates }) => {
    const picked = pickTranscript(candidates, expectedForms(node, ctx));
    let ok;
    if (node === "q_fork") ok = !picked.lowConfidence && picked.route === want;
    // Empathy has no fixed vocabulary: the picker only checks that something
    // was said (a one-word «Қорықпа!» scores 0.5 yet is accepted, and the LLM
    // classifier judges the meaning), so a confident non-empty pick is a pass.
    else if (node === "q_courage") ok = !picked.lowConfidence && picked.transcript.trim() !== "";
    else ok = !picked.lowConfidence && picked.score === 1;
    return { ok, transcript: picked.transcript, lang: picked.lang, route: picked.route, reason: picked.reason };
  });
  process.stdout.write(JSON.stringify(out));
});
