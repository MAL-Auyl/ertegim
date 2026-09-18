// Dual-language transcript picking for child speech (STT stage 2).
//
// Whisper is asked the same clip once per configured pass (by default one
// auto-detect pass and one forced Russian pass; previously once as Kazakh,
// once as Russian) —
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
// Kept for the offline client parity checks; the picker uses ROUTE_FORMS.
const ROUTE_KEYWORDS = {
  river: ["солға", "солжақ", "өзен", "налев", "лев", "рек", "реч"],
  forest: ["оң", "орман", "направ", "прав", "лес"],
};

// Picker-side route vocabulary: whole words, not the aggressive stems above.
// Bare «оң», «лев», «прав», «рек» made «он», «она», «правда», «рекорд» score a
// confident 1 and sent the child down a route they never chose — at a fork
// that is worse than re-asking. Multi-word forms («в лес», «сол жақ») are
// matched against joined adjacent word pairs, see matchesForm().
const ROUTE_FORMS = {
  river: ["солға", "солжақ", "өзен", "өзенге", "налево", "к реке", "реке", "речке", "река"],
  forest: ["оңға", "оңжақ", "орман", "орманға", "направо", "в лес", "лес", "лесу"],
};

// Which route a single expected form belongs to (null if it belongs to none).
function routeOf(form) {
  const t = phonetic(String(form || "").replace(/\s+/g, ""));
  for (const [route, forms] of Object.entries(ROUTE_FORMS)) {
    if (forms.some((f) => phonetic(f.replace(/\s+/g, "")) === t)) return route;
  }
  return null;
}

// What a correct answer at this node can look like. `forms` is a flat list of
// candidate surface forms; `kind` decides how a transcript is scored against
// it (rhyme and empathy have no fixed vocabulary at all).
function expectedForms(nodeId, ctx = {}) {
  if (nodeId === "q_tracks") {
    const n = Number(ctx.trackCount);
    // A missing/garbled trackCount used to silently become NUM_FORMS[0] = [],
    // i.e. a "count" node where every possible answer scores 0 — which reads
    // downstream as "the child said nothing right" instead of "we forgot to
    // send the count". Degrade to free-form (something was said) and say so.
    if (!Number.isInteger(n) || n < 1 || n >= NUM_FORMS.length) {
      console.warn(`expectedForms(q_tracks): invalid trackCount ${JSON.stringify(ctx.trackCount)} → free-form scoring`);
      return { kind: "free", forms: [] };
    }
    return { kind: "count", forms: [...NUM_FORMS[n]] };
  }
  if (nodeId === "q_fork") {
    // Route-tagged: the picker has to know WHICH route a match points at, so
    // that kk=«өзенге» + ru=«направо» is a disagreement to re-ask, not a
    // coin-flip between two equally "correct" recognitions.
    return {
      kind: "choice",
      forms: [
        { route: "river", forms: [...ROUTE_FORMS.river] },
        { route: "forest", forms: [...ROUTE_FORMS.forest] },
      ],
    };
  }
  if (nodeId === "q_courage") return { kind: "empathy", forms: [] };
  if (nodeId === "q_echo") return { kind: "rhyme", forms: [] };
  return { kind: "free", forms: [] };
}

// Adjacent words joined, so a two-word form («в лес», «сол жақ») can be
// matched against a transcript that is split into separate tokens.
function withBigrams(words) {
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(words[i] + words[i + 1]);
  return out;
}

// Strict variant used for `choice` (fork) matching: phonetic equality, or a
// prefix match only when the form is long enough (≥5 phonetic letters) that a
// prefix cannot be a different everyday word. No edit-distance slack at all —
// at a fork a wrong match sends the child down the other path.
function matchesChoiceForm(words, form) {
  const t = phonetic(String(form || "").replace(/\s+/g, ""));
  if (!t) return false;
  return withBigrams(words).some((w) => {
    const p = phonetic(w);
    return p === t || (t.length >= 5 && p.startsWith(t));
  });
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
// For `choice` nodes the return value is { score, route } instead of a bare
// number: score 1 when exactly one route matched (route names it), 0.5 with
// route null when the transcript points at BOTH routes (ambiguous — «налево
// или направо?»), 0 when neither matched.
function scoreTranscript(text, expected) {
  const kind = expected?.kind || "free";
  const isChoice = kind === "choice";
  const none = isChoice ? { score: 0, route: null } : 0;
  if (isHallucination(text)) return none;
  const words = wordsOf(text);
  if (words.length === 0) return none;
  if (isChoice) {
    const hit = (expected.forms || [])
      .filter((g) => (g.forms || []).some((f) => matchesChoiceForm(words, f)))
      .map((g) => g.route);
    if (hit.length === 1) return { score: 1, route: hit[0] };
    if (hit.length > 1) return { score: 0.5, route: null };
    return { score: 0, route: null };
  }
  if (kind === "count") {
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
// An absent avg_logprob (null) is NOT the same as avg_logprob 0: 0 means
// "Whisper was perfectly sure", absent means "Whisper told us nothing". In
// that case the logprob term is dropped and the score carries the confidence
// on its own, instead of a silent free +0.4.
function confidenceOf(score, avgLogprob) {
  if (avgLogprob === null || avgLogprob === undefined || !Number.isFinite(Number(avgLogprob))) {
    return Math.round(score * 100) / 100;
  }
  const q = Math.max(0, Math.min(1, 1 + Number(avgLogprob) / -LOGPROB_MIN));
  return Math.round((0.6 * score + 0.4 * q) * 100) / 100;
}

function pickTranscript(candidates, expected, opts = {}) {
  const noSpeechMax = opts.noSpeechMax ?? NO_SPEECH_MAX;
  const logprobMin = opts.logprobMin ?? LOGPROB_MIN;

  const scored = (candidates || [])
    .filter((c) => c && !isHallucination(c.text))
    .map((c) => {
      const raw = scoreTranscript(c.text, expected);
      const score = typeof raw === "number" ? raw : raw.score;
      const route = typeof raw === "number" ? null : raw.route;
      const avgLogprob = c.avgLogprob === null || c.avgLogprob === undefined || !Number.isFinite(Number(c.avgLogprob))
        ? null
        : Number(c.avgLogprob);
      const noSpeechProb = Number(c.noSpeechProb) || 0;
      // An exact expected match overrides Whisper's doubt: on a quiet clip it
      // routinely reports noSpeechProb ≈ 0.9 for a perfectly correct «үш».
      const shaky = score < 1
        && (noSpeechProb > noSpeechMax || (avgLogprob !== null && avgLogprob < logprobMin));
      return { ...c, score, route, avgLogprob, noSpeechProb, shaky };
    });

  if (scored.length === 0) {
    return {
      transcript: "", lang: null, route: null, score: 0, confidence: 0, lowConfidence: true,
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
      transcript: String(fallback.text ?? ""),
      lang: fallback.lang ?? null,
      route: null,
      score: fallback.score,
      confidence: confidenceOf(fallback.score, fallback.avgLogprob),
      lowConfidence: true,
      reason: fallback.shaky ? "тихо/неуверенное распознавание" : "ответ не распознан",
    };
  }

  // Highest score; tie → higher avgLogprob; tie → first in the order the
  // candidates were given. That order is STT_LANGS (default "auto,ru"), so
  // the auto-detect pass wins a dead tie — deliberately, since forcing a
  // language is what made Whisper hallucinate in the first place. A
  // candidate whose `lang` is "auto" (Whisper returned no detection) is an
  // ordinary candidate here: nothing in the scoring reads the tag, it only
  // labels the result for the operator log and the classifier prompt.
  const best = usable.reduce((a, b) => {
    if (b.score > a.score) return b;
    if (b.score < a.score) return a;
    return (b.avgLogprob ?? 0) > (a.avgLogprob ?? 0) ? b : a;
  });

  // Fork disagreement: both passes heard a clear but DIFFERENT route (kk
  // «өзенге», ru «направо»). There is no honest way to choose — the old tie
  // -break on avgLogprob was a coin flip that silently decided the child's
  // path. Hand back low confidence so the story re-asks.
  const routes = [...new Set(usable.filter((c) => c.score === 1 && c.route).map((c) => c.route))];
  if (routes.length > 1) {
    return {
      transcript: String(best.text ?? ""),
      lang: best.lang ?? null,
      route: null,
      score: best.score,
      confidence: confidenceOf(best.score, best.avgLogprob),
      lowConfidence: true,
      reason: "route disagreement",
    };
  }

  return {
    transcript: String(best.text ?? ""),
    lang: best.lang ?? null,
    route: best.route ?? (routes[0] ?? null),
    score: best.score,
    confidence: confidenceOf(best.score, best.avgLogprob),
    lowConfidence: false,
    reason: `выбран ${best.lang || "?"} (score=${best.score})`,
  };
}

// The picker already refuses to believe a hallucinated candidate, but the
// raw candidate list was still shipped to the client as `alternatives` and
// forwarded to the classifier, where "Субтитры сделал DimaTorzok" reads as a
// real second opinion (and, worse, went through the blocklist). Anything the
// picker would not consider must not leave the server either.
function filterHallucinations(alternatives) {
  return (alternatives || []).filter((a) => {
    if (a === null || a === undefined) return false;
    return !isHallucination(typeof a === "string" ? a : a.text);
  });
}

export {
  phonetic, levenshtein, tolerance, wordsOf,
  HALLUCINATIONS, isHallucination, filterHallucinations,
  NUM_FORMS, ROUTE_KEYWORDS, ROUTE_FORMS, routeOf,
  expectedForms, scoreTranscript, pickTranscript,
  matchesForm, matchesChoiceForm, confidenceOf,
  NO_SPEECH_MAX, LOGPROB_MIN,
};
