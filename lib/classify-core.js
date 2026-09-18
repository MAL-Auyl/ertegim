// LLM answer classifier — the shared core behind BOTH backends:
// server/server.js's /api/classify (local Bun, WoZ operator) and
// api/classify.js (Vercel Edge, the deployed demo). Extracted so the cloud
// endpoint can't silently drift from the local one: before this split the
// Vercel copy still ran the old single-transcript prompt while the local
// server had already moved to the dual-recognition one, so the deployed
// site judged the same answer differently from the laptop.
//
// Plain ESM, fetch-only, no Bun/Node/DOM APIs — same rule as
// lib/stt-pick.js, lib/blocklist-core.js and lib/stt-hints-core.js, because
// Vercel Edge has none of them.
//
// Kept deliberately separate from the blocklist: the blocklist is a
// hard-coded, network-free safety gate that fails CLOSED; this classifier
// only judges answer correctness and is allowed to fail OPEN (the client
// drops back to its local fuzzy classifier / the operator's own buttons),
// since a wrong «верно»/«неверно» here costs one extra re-ask, not a safety
// incident. See IDEA.md «Как закрываем риски».

// This Groq account has no llama-3.x chat access (checked via /v1/models) —
// gpt-oss-20b is the fastest model it does have access to, plenty for a
// 3-way classification call.
const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
const CLASSIFY_TIMEOUT_MS = 4000;

// Caps: this body is sent straight into an LLM prompt, so an oversized or
// repeated field is both a cost and a prompt-injection surface. Two
// recognitions, a handful of expected forms and one short child answer is
// all this endpoint is ever meant to carry.
const MAX_TRANSCRIPT = 500;
const MAX_ALTERNATIVES = 4;
const MAX_ALT_TEXT = 300;
const MAX_ALT_LANG = 8;
const MAX_FORMS = 32;
const MAX_FORM_TEXT = 40;

// Shared request-body sanitizer for both handlers. Returns the capped
// fields plus `valid`, so each backend can answer 400 in its own
// Response/Response.json dialect without duplicating the checks.
function sanitizeClassifyInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const valid =
    typeof b.transcript === "string" &&
    typeof b.questionKk === "string" &&
    typeof b.criterion === "string";
  return {
    valid,
    transcript: String(b.transcript ?? "").slice(0, MAX_TRANSCRIPT),
    questionKk: String(b.questionKk ?? "").slice(0, MAX_TRANSCRIPT),
    criterion: String(b.criterion ?? "").slice(0, MAX_TRANSCRIPT),
    alternatives: (Array.isArray(b.alternatives) ? b.alternatives : [])
      .slice(0, MAX_ALTERNATIVES)
      .map((a) =>
        a && typeof a === "object"
          ? { lang: String(a.lang ?? "").slice(0, MAX_ALT_LANG), text: String(a.text ?? "").slice(0, MAX_ALT_TEXT) }
          : String(a).slice(0, MAX_ALT_TEXT),
      ),
    expectedForms: (Array.isArray(b.expectedForms) ? b.expectedForms : [])
      .slice(0, MAX_FORMS)
      .map((s) => String(s).slice(0, MAX_FORM_TEXT)),
  };
}

// Split out of classifyAnswer purely so tests can assert the prompt shape
// without a network call — in particular that the choice-exception sentence
// appears only when we actually gave the model something to check against.
function buildMessages({ transcript, questionKk, criterion, alternatives = [], expectedForms = [] }) {
  const alts = alternatives || [];
  const forms = expectedForms || [];
  // The classifier sees BOTH recognitions, not just the picked one: when kk
  // and ru disagree, one of them is usually the child's actual answer, and a
  // model reading both can say so where a string comparison cannot.
  // Read by LANGUAGE TAG, not by position: when one of the two Groq passes
  // fails or is filtered out as a hallucination, alts[1] is not the ru pass,
  // and labelling a Kazakh answer «распознавание ru» misleads the model.
  const byLang = (l) => {
    const hit = alts.find((a) => a && typeof a === "object" && a.lang === l);
    return hit ? String(hit.text ?? "") : "";
  };
  const plain = alts.filter((a) => typeof a === "string"); // backward compat
  // With STT_LANGS=auto,ru (see README) the first pass is tagged by the
  // language Whisper itself detected, so «kk» is not guaranteed to be
  // present — fall back to the picked transcript, which is what the old
  // single-recognition prompt used anyway.
  const kkAlt = byLang("kk") || plain[0] || transcript;
  const ruAlt = byLang("ru") || plain[1] || "";
  // Only claim "one of the recognitions is enough" when we actually gave the
  // model something to check against; with no expected forms and no second
  // recognition that sentence just invites a guess.
  const hasExpectation = forms.length > 0 || alts.length > 0;
  return [
    {
      role: "system",
      content:
        "Ты оцениваешь ответ ребёнка 3-7 лет в детской интерактивной сказке. " +
        "Тебе дают вопрос героя, критерий правильного ответа и то, что реально " +
        "распознала речь-в-текст система (может быть неточным/обрезанным — " +
        "суди по смыслу, а не по буквальному совпадению). Верни ТОЛЬКО JSON вида " +
        '{"label": "correct" | "incorrect" | "unclear", "reason": "коротко, по-русски"}. ' +
        '"unclear" — если ответ пустой, невнятный или не по теме вопроса (не значит ' +
        "«неверно», значит «нужно переспросить»)." +
        (hasExpectation
          ? " Если хотя бы одно из распознаваний содержит ожидаемый ответ — считай его верным. " +
            "Исключение — вопросы с выбором варианта: если распознавания указывают на разные " +
            "варианты, верни unclear."
          : ""),
    },
    {
      role: "user",
      content:
        `Вопрос героя: ${questionKk}\nКритерий: ${criterion}\n` +
        `Ответ ребёнка — распознавание kk: "${kkAlt}"; распознавание ru: "${ruAlt}"\n` +
        `Ожидаемые формы ответа: ${forms.join(", ") || "—"}`,
    },
  ];
}

// One Groq chat-completions call. Throws on anything that isn't a clean
// verdict (missing key, timeout, HTTP error, unparsable JSON) — both callers
// catch and fail open.
async function classifyAnswer({
  apiKey,
  transcript,
  questionKk,
  criterion,
  alternatives = [],
  expectedForms = [],
  timeoutMs = CLASSIFY_TIMEOUT_MS,
  model = GROQ_CHAT_MODEL,
}) {
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const t0 = Date.now();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: buildMessages({ transcript, questionKk, criterion, alternatives, expectedForms }),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`groq chat http ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const ms = Date.now() - t0;
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    // Anything outside the three labels is treated as «переспросить», never
    // as a verdict — an unexpected label must not advance the story.
    const label = ["correct", "incorrect", "unclear"].includes(parsed.label) ? parsed.label : "unclear";
    return { label, reason: String(parsed.reason || ""), ms };
  } finally {
    clearTimeout(timer);
  }
}

export {
  classifyAnswer,
  sanitizeClassifyInput,
  buildMessages,
  GROQ_CHAT_MODEL,
  CLASSIFY_TIMEOUT_MS,
  MAX_TRANSCRIPT,
  MAX_ALTERNATIVES,
  MAX_ALT_TEXT,
  MAX_FORMS,
  MAX_FORM_TEXT,
};
