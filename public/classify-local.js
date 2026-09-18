// Local, network-free answer check — used only when /api/classify is
// unreachable, so the story still confirms itself instead of stalling.
// Same word-level fuzzy matching as lib/blocklist-core.js (Levenshtein
// tolerance scaled to word length). Pure functions, no DOM: loaded as a
// classic <script> in index.html and require()'d by bun test.

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

function tolerance(len) {
  if (len <= 6) return 1;
  return Math.max(2, Math.floor(len * 0.3));
}

function wordsOf(transcript) {
  return String(transcript || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'«»]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Children and STT both "simplify" Kazakh-specific sounds the same way
// (қ→к, ү→у, і→и …), so answers are compared as rough phonetic strings,
// not letter-for-letter. Applied to both sides of every fuzzy match.
const PHONETIC_MAP = {
  қ: "к", ғ: "г", ң: "н", һ: "х", ә: "а", ө: "о", ү: "у", ұ: "у", і: "и", ы: "и",
  э: "е", ё: "е", й: "и", ь: "", ъ: "",
};
function phonetic(word) {
  const mapped = String(word || "")
    .toLowerCase()
    .split("")
    .map((ch) => (ch in PHONETIC_MAP ? PHONETIC_MAP[ch] : ch))
    .join("");
  return mapped.replace(/(.)\1+/g, "$1");
}

// Accepted spoken forms of 1..5: canonical kk/ru plus the distortions a
// 3-7-year-old (and Whisper on a 3-7-year-old) actually produce.
const NUM_FORMS = [
  [],
  ["бір", "бир", "один", "адин", "раз", "1"],
  ["екі", "еки", "два", "дфа", "2"],
  ["үш", "уш", "уч", "три", "тры", "тли", "тьли", "3"],
  ["төрт", "торт", "четыре", "четыле", "четыри", "4"],
  ["бес", "пять", "пяць", "пат", "5"],
];

function fuzzyIncludes(words, target) {
  const t = phonetic(target);
  if (!t) return false;
  return words.some((w) => levenshtein(phonetic(w), t) <= tolerance(t.length));
}

// Kazakh + Russian keywords for the fork question. Matched as prefixes so
// case endings (солға, өзенге, орманға, реку, лесу) don't matter.
const ROUTE_KEYWORDS = {
  river: ["солға", "солжақ", "өзен", "налев", "лев", "рек", "реч"],
  forest: ["оң", "орман", "направ", "прав", "лес"],
};

function detectRoute(words) {
  // Bare «сол» (just the one word, no suffix) is a valid river answer on
  // its own, but "сол" is also a prefix of "солай" ("that way" / filler),
  // which is NOT a route answer — so it only counts as an exact single word.
  if (words.length === 1 && words[0] === "сол") return "river";
  for (const [route, keys] of Object.entries(ROUTE_KEYWORDS)) {
    if (words.some((w) => keys.some((k) => w.startsWith(k)))) return route;
  }
  return null;
}

function localClassify(node, transcript, ctx) {
  const words = wordsOf(transcript);
  if (words.length === 0) return { label: "unclear", reason: "пусто (локально)" };

  if (node.mode === "branch") {
    const route = detectRoute(words);
    return route
      ? { label: "correct", reason: `маршрут: ${route} (локально)`, route }
      : { label: "unclear", reason: "направление не распознано (локально)" };
  }

  if (node.mode === "open") {
    const meaningful = words.filter((w) => w.length >= 3);
    return meaningful.length >= 1
      ? { label: "correct", reason: "ребёнок заговорил (локально)" }
      : { label: "unclear", reason: "слишком коротко (локально)" };
  }

  if (node.skill === "count") {
    const n = ctx.trackCount;
    const accepted = [ctx.numKk?.[n], ctx.numRu?.[n], String(n), ...(NUM_FORMS[n] || [])].filter(Boolean);
    const hit = accepted.some((form) => fuzzyIncludes(words, form));
    return hit
      ? { label: "correct", reason: "число совпало (локально)" }
      : { label: "unclear", reason: "число не совпало (локально)" };
  }

  if (node.skill === "rhyme") {
    const rhymes = words.some((w) => /(ик|ык)$/.test(phonetic(w)));
    return rhymes
      ? { label: "correct", reason: "рифма «-ық/-ик» (локально)" }
      : { label: "unclear", reason: "рифма не найдена (локально)" };
  }

  return { label: "unclear", reason: "неизвестный режим (локально)" };
}

if (typeof module !== "undefined") {
  module.exports = { localClassify, detectRoute, wordsOf, levenshtein, phonetic, NUM_FORMS };
}
