// Hint ladder — the tale adapts to the child.
//
// A missed answer used to get one fixed re-ask line, then the hero answered
// himself. Now every question climbs a ladder, and how far depends on the
// child:
//   1. a verbal hint — the question's own re-ask line ("Алма қайда?");
//   2. a VISUAL hint on the last try before the reveal — the right picture
//      card glows (pick), the things to count appear one by one with their
//      numbers (count), the articulation picture grows and pulses
//      (imitate);
//   3. the hero shows the answer and praises the attempt (onReveal).
// Personalised from the child's own history: a skill that needed the hero's
// demonstration last time gets one extra step of support this time (up to
// three re-asks); the ladder never gets shorter than the mode's default.
//
// Pure functions, no DOM: classic <script> on story.html (before app.js),
// require()'d by tests/hints.test.js.

const HINT_MAX_REASKS = 3;

// The visual support a question can offer, or null when it has none
// (open questions — any speech is right; the route fork — no wrong answer;
// the rhyme — no single answer to show).
function visualSupportKind(node) {
  if (!node || node.kind !== "question") return null;
  if (node.mode === "pick" && Array.isArray(node.choices) && node.onAnswer) return "highlight";
  // things to count: the lessons' row of apples/bees/stars, or the tale's tracks
  if (node.count || node.skill === "count") return "count";
  // say this sound/word: the syllable card (story.js `model`)
  if (node.model) return "model";
  return null;
}

// The child's last results on one skill, newest first ("first" | "reask" |
// "reveal"), from Session.history() (newest first). Skipped ones are ignored.
function recentSkillStates(history, skill, n = 2) {
  const out = [];
  for (const s of history || []) {
    const st = s && s.skills && s.skills[skill];
    if (st && st !== "skipped") out.push(st);
    if (out.length >= n) break;
  }
  return out;
}

// How many re-asks this question gets for this child: the mode's default
// (1, or 2 in gentle mode / a therapist's setting), plus one when the hero
// had to show this skill's answer last time.
function adaptiveMaxReasks(base, recent) {
  const b = Math.max(1, Math.min(HINT_MAX_REASKS, Number(base) || 1));
  return recent && recent[0] === "reveal" ? Math.min(HINT_MAX_REASKS, b + 1) : b;
}

// Is the visual hint on for the try that is about to start? Only on the
// last try before the reveal (so a first miss still gets a chance with the
// words alone), and only when the question has something to show.
function visualSupportNow(node, reaskCount, maxReasks) {
  const kind = visualSupportKind(node);
  if (!kind || reaskCount < 1) return null;
  return reaskCount >= maxReasks ? kind : null;
}

const Hints = { visualSupportKind, recentSkillStates, adaptiveMaxReasks, visualSupportNow, HINT_MAX_REASKS };

if (typeof module !== "undefined") {
  module.exports = { Hints, ...Hints };
}
