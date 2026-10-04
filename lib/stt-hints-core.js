// Per-question vocabulary hint for Whisper's `prompt` field. Shared by
// server/server.js (Bun) and api/transcribe.js (Vercel Edge) — plain ESM, no
// Bun/DOM APIs, same split as blocklist-core.js. A prompt that names only
// the words a child could plausibly answer with biases the decoder far
// harder than one generic list for every question.

const DEFAULT_HINT =
  "Сәлем, түлкі, үкі, жидек, санау, ұйқас, мысық, балық, қасық, дұрыс, ойнайық, " +
  "бір, екі, үш, төрт, бес, один, два, три, четыре, пять";

const HINTS = {
  q_tracks: "із, санау, бір, екі, үш, төрт, бес, один, два, три, четыре, пять",
  q_count5: "алма, санау, бір, екі, үш, төрт, бес, один, два, три, четыре, пять",
  q_plus: "алма, қосу, бір, екі, үш, төрт, бес, один, два, три, четыре, пять",
  q_minus: "алма, қалды, бір, екі, үш, төрт, бес, один, два, три, четыре, пять",
  q_letter_a: "А, алма, әріп, ата, ана",
  q_fork: "солға, оңға, өзен, орман, сол жақ, оң жақ, налево, направо, река, лес",
  q_courage: "қорықпа, мен сенімен біргемін, батыл, бәрі жақсы, не бойся, я с тобой, ты смелый, всё хорошо",
  // Letter lesson «А» (LESSON_A in public/story.js): the imitation targets
  // and the two picture words, so the decoder hears «а-а-а» as a vowel and
  // not as subtitle boilerplate.
  q_a_sound: "а, а-а-а, аа, ах, алма, ана",
  q_a_alma: "алма, ал-ма, яблоко, ана, а",
  q_a_pick: "алма, доп, яблоко, мяч, а",
  q_a_ana: "ана, анам, анашым, мама, апа, әже, сүйемін, жақсы",
  // Letter lessons «О» and «Ұ» (LESSON_O / LESSON_U).
  q_o_sound: "о, о-о-о, оо, ох, ой, от, орман",
  q_o_ot: "от, о-от, огонь, огонёк, о",
  q_o_pick: "от, мысық, огонь, кошка, мяу, о",
  q_o_toy: "ойыншық, доп, қуыршақ, машина, аю, игрушка, мяч, кукла",
  q_u_sound: "ұ, ұ-ұ-ұ, у, у-у-у, ух, ұшақ, ұя",
  q_u_ushaq: "ұшақ, ұ-шақ, ушақ, самолёт, ұ",
  q_u_pick: "ұшақ, алма, самолёт, яблоко, ұ",
  q_u_like: "ұнайды, маған ұнайды, жақсы көремін, ойнау, алма, нравится, люблю",
};

function cleanName(name) {
  return String(name || "").toLowerCase().replace(/[^\p{L}]/gu, "").slice(0, 24);
}

function sttHintFor(nodeId, ctx = {}) {
  if (nodeId === "q_echo") {
    const name = cleanName(ctx.brotherName);
    return `${name ? name + ", " : ""}балық, мысық, қасық, ұйқас, жаңғырық`;
  }
  return HINTS[nodeId] || DEFAULT_HINT;
}

export { sttHintFor, DEFAULT_HINT };
