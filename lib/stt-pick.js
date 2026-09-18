// Dual-language transcript picking for child speech (STT stage 2).
//
// Whisper is asked the same clip twice — once as Kazakh, once as Russian —
// because a 3-7-year-old in Kazakhstan answers in whichever language comes
// first, often mid-sentence, and a single `language=kk` pass turns a Russian
// "три" into Kazakh-looking noise (and vice versa). This module decides which
// of the two recognitions to believe, using what the story actually expects
// at this node rather than Whisper's own self-reported confidence alone.
//
// Plain ESM, no Bun/DOM APIs — shared by server/server.js, api/transcribe.js
// (Vercel Edge) and the local STT lab page. Same split as blocklist-core.js
// and stt-hints-core.js.

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

// Kept byte-identical in behaviour to public/classify-local.js's phonetic()
// — tests/stt-pick.test.js asserts parity on a word list, so the server and
// the offline client fallback can never drift into judging the same answer
// differently.
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

// Whisper fills silence with its training-data boilerplate (YouTube subtitle
// credits, music markers). On a quiet child clip this is the single most
// common failure mode, and it looks like a perfectly confident recognition —
// so it is filtered by text, before any scoring.
const HALLUCINATIONS = [
  "субтитры",
  "продолжение следует",
  "dimatorzok",
  "спасибо за просмотр",
  "редактор субтитров",
  "thank you for watching",
  "music",
  "[музыка]",
  "♪",
];

function isHallucination(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return true;
  if (HALLUCINATIONS.some((h) => t.includes(h))) return true;
  // Nothing but punctuation/symbols ("...", "!", "-") is silence too.
  return !/[\p{L}\p{N}]/u.test(t);
}

// Accepted spoken forms of 1..5 — the server-side single source. Mirrors the
// table in public/classify-local.js, which stays as-is (it is a classic
// <script>, not a module, and must keep working with zero network).
const NUM_FORMS = [
  [],
  ["бір", "бир", "один", "адин", "раз", "1"],
  ["екі", "еки", "два", "дфа", "2"],
  ["үш", "уш", "уч", "три", "тры", "тли", "тьли", "3"],
  ["төрт", "торт", "четыре", "четыле", "четыри", "4"],
  ["бес", "пять", "пяць", "пат", "5"],
];

// Matched as prefixes so case endings (солға, өзенге, орманға, реку, лесу)
// don't matter — same list as public/classify-local.js's ROUTE_KEYWORDS.
const ROUTE_KEYWORDS = {
  river: ["солға", "солжақ", "өзен", "налев", "лев", "рек", "реч"],
  forest: ["оң", "орман", "направ", "прав", "лес"],
};

// What a correct answer at this node can look like. `forms` is a flat list of
// candidate surface forms; `kind` decides how a transcript is scored against
// it (rhyme and empathy have no fixed vocabulary at all).
function expectedForms(nodeId, ctx = {}) {
  if (nodeId === "q_tracks") {
    const n = Number(ctx.trackCount);
    return { kind: "count", forms: [...(NUM_FORMS[n] || [])] };
  }
  if (nodeId === "q_fork") {
    return { kind: "choice", forms: [...ROUTE_KEYWORDS.river, ...ROUTE_KEYWORDS.forest] };
  }
  if (nodeId === "q_courage") return { kind: "empathy", forms: [] };
  if (nodeId === "q_echo") return { kind: "rhyme", forms: [] };
  return { kind: "free", forms: [] };
}

function matchesForm(words, form) {
  const t = phonetic(form);
  if (!t) return false;
  return words.some((w) => {
    const p = phonetic(w);
    // Prefix match covers case endings; Levenshtein covers a child's (and
    // Whisper's) mangling of the stem itself. Forms of 3 letters or fewer
    // («уш», «3», «лес») get no edit-distance slack at all: at that length
    // one substitution is a different word, and letting «уж» count as «уш»
    // (or «мм» as «3») is exactly what makes the ru pass beat the kk one on
    // an answer it never recognized.
    if (t.length <= 3) return p === t || p.startsWith(t);
    return p.startsWith(t) || levenshtein(p, t) <= tolerance(t.length);
  });
}

// 0..1, how well this text answers what the node expects. Deliberately blunt:
// it only has to separate "this is the answer" from "this is noise" well
// enough to choose between two recognitions of the same clip.
function scoreTranscript(text, expected) {
  if (isHallucination(text)) return 0;
  const words = wordsOf(text);
  if (words.length === 0) return 0;
  const kind = expected?.kind || "free";
  if (kind === "count" || kind === "choice") {
    return (expected.forms || []).some((f) => matchesForm(words, f)) ? 1 : 0;
  }
  if (kind === "rhyme") return words.some((w) => /(ик|ык)$/.test(phonetic(w))) ? 1 : 0;
  if (kind === "empathy") return Math.min(1, words.filter((w) => w.length >= 3).length / 2);
  return 0.5; // free-form: something was said, that is all the node asks for
}

const NO_SPEECH_MAX = 0.6;
const LOGPROB_MIN = -1.2;

// confidence = 0.6 * score + 0.4 * logprobQuality, where logprobQuality maps
// avgLogprob 0 → 1 and LOGPROB_MIN (-1.2) or worse → 0. Weighted towards the
// expected-answer score because Whisper's own numbers are unreliable on quiet
// child speech, while "the child said exactly the expected word" is not.
function confidenceOf(score, avgLogprob) {
  const q = Math.max(0, Math.min(1, 1 + (Number(avgLogprob) || 0) / -LOGPROB_MIN));
  return Math.round((0.6 * score + 0.4 * q) * 100) / 100;
}

function pickTranscript(candidates, expected, opts = {}) {
  const noSpeechMax = opts.noSpeechMax ?? NO_SPEECH_MAX;
  const logprobMin = opts.logprobMin ?? LOGPROB_MIN;

  const scored = (candidates || [])
    .filter((c) => c && !isHallucination(c.text))
    .map((c) => {
      const score = scoreTranscript(c.text, expected);
      const avgLogprob = Number(c.avgLogprob) || 0;
      const noSpeechProb = Number(c.noSpeechProb) || 0;
      // An exact expected match overrides Whisper's doubt: on a quiet clip it
      // routinely reports noSpeechProb ≈ 0.9 for a perfectly correct «үш».
      const shaky = score < 1 && (noSpeechProb > noSpeechMax || avgLogprob < logprobMin);
      return { ...c, score, avgLogprob, noSpeechProb, shaky };
    });

  if (scored.length === 0) {
    return {
      transcript: "", lang: null, score: 0, confidence: 0, lowConfidence: true,
      reason: "нет кандидатов (пусто/галлюцинация)",
    };
  }

  const usable = scored.filter((c) => !c.shaky && c.score > 0);
  if (usable.length === 0) {
    // Nothing trustworthy: hand back the best text we have (so the operator
    // log shows what Whisper heard) but flag it — the client re-asks gently
    // instead of sending noise to the classifier.
    const fallback = scored.find((c) => wordsOf(c.text).length > 0) || scored[0];
    return {
      transcript: fallback.text || "",
      lang: fallback.lang ?? null,
      score: fallback.score,
      confidence: confidenceOf(fallback.score, fallback.avgLogprob),
      lowConfidence: true,
      reason: fallback.shaky ? "тихо/неуверенное распознавание" : "ответ не распознан",
    };
  }

  // Highest score; tie → higher avgLogprob; tie → first (kk comes first).
  const best = usable.reduce((a, b) => {
    if (b.score > a.score) return b;
    if (b.score < a.score) return a;
    return b.avgLogprob > a.avgLogprob ? b : a;
  });

  return {
    transcript: best.text,
    lang: best.lang ?? null,
    score: best.score,
    confidence: confidenceOf(best.score, best.avgLogprob),
    lowConfidence: false,
    reason: `выбран ${best.lang || "?"} (score=${best.score})`,
  };
}

export {
  phonetic, levenshtein, tolerance, wordsOf,
  HALLUCINATIONS, isHallucination,
  NUM_FORMS, ROUTE_KEYWORDS,
  expectedForms, scoreTranscript, pickTranscript,
  NO_SPEECH_MAX, LOGPROB_MIN,
};
