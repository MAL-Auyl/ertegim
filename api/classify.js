// Vercel Edge Function — cloud counterpart to app/server.js's /api/classify
// route. Same Groq chat-completions call, same prompt, same response shape,
// so app.js's classifyAndSuggest() works identically against either
// backend. Fails OPEN on any error (bad key, timeout, network) — the
// client already has a local, network-free fallback classifier for
// exactly this case (see app.js localClassify()), so a 500 here just
// means "use the local one," never a stall.
export const config = { runtime: "edge" };

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
const CLASSIFY_TIMEOUT_MS = 4000;

async function classifyAnswer(transcript, questionKk, criterion) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
  try {
    const t0 = Date.now();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Ты оцениваешь ответ ребёнка 3-7 лет в детской интерактивной сказке. " +
              "Тебе дают вопрос героя, критерий правильного ответа и то, что реально " +
              "распознала речь-в-текст система (может быть неточным/обрезанным — " +
              "суди по смыслу, а не по буквальному совпадению). Верни ТОЛЬКО JSON вида " +
              '{"label": "correct" | "incorrect" | "unclear", "reason": "коротко, по-русски"}. ' +
              '"unclear" — если ответ пустой, невнятный или не по теме вопроса (не значит ' +
              "«неверно», значит «нужно переспросить»).",
          },
          {
            role: "user",
            content: `Вопрос героя: ${questionKk}\nКритерий: ${criterion}\nОтвет ребёнка (транскрипт): "${transcript}"`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`groq chat http ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const ms = Date.now() - t0;
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const label = ["correct", "incorrect", "unclear"].includes(parsed.label) ? parsed.label : "unclear";
    return { label, reason: String(parsed.reason || ""), ms };
  } finally {
    clearTimeout(timer);
  }
}

// See the matching guard in api/transcribe.js — same reasoning, same
// (deliberately loose) check.
const ALLOWED_ORIGIN_HOST = /(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/;
function isAllowedOrigin(request) {
  const origin = request.headers.get("origin") || request.headers.get("referer");
  if (!origin) return false;
  try {
    return ALLOWED_ORIGIN_HOST.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }
  if (!isAllowedOrigin(request)) {
    return new Response(JSON.stringify({ error: "forbidden origin" }), { status: 403 });
  }
  try {
    const { transcript, questionKk, criterion } = await request.json();
    if (typeof transcript !== "string" || typeof questionKk !== "string" || typeof criterion !== "string") {
      return new Response(JSON.stringify({ error: "missing transcript/questionKk/criterion field" }), { status: 400 });
    }
    const { label, reason, ms } = await classifyAnswer(transcript, questionKk, criterion);
    return new Response(JSON.stringify({ label, reason, ms }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
