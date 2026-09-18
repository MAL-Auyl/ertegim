// Vercel Edge Function — cloud counterpart to server/server.js's
// /api/classify route, so the deployed site gets the real LLM verdict
// instead of always falling back to the client's local fuzzy-match
// classifier.
//
// The prompt, model, caps and response shape all live in
// ../lib/classify-core.js, shared with server/server.js: the first version
// of this file was a copy-paste of the local handler and immediately fell
// behind it (it still ran the single-transcript prompt after the local
// server had moved to the dual-recognition one), which meant the deployed
// demo judged the same answer differently from the laptop.
//
// Fails OPEN on any error (bad key, timeout, network): the client already
// has a local, network-free fallback classifier for exactly this case (see
// public/classify-local.js), so a 500 here means "use the local one", never
// a stall.
import { classifyAnswer, sanitizeClassifyInput } from "../lib/classify-core.js";
import { isAllowedOrigin } from "../lib/origin-guard.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }
  if (!isAllowedOrigin(request)) {
    return new Response(JSON.stringify({ error: "forbidden origin" }), { status: 403 });
  }
  try {
    const body = await request.json();
    const input = sanitizeClassifyInput(body);
    if (!input.valid) {
      return new Response(
        JSON.stringify({ error: "missing transcript/questionKk/criterion field" }),
        { status: 400 },
      );
    }
    const { label, reason, ms } = await classifyAnswer({
      apiKey: process.env.GROQ_API_KEY,
      transcript: input.transcript,
      questionKk: input.questionKk,
      criterion: input.criterion,
      alternatives: input.alternatives,
      expectedForms: input.expectedForms,
    });
    return new Response(JSON.stringify({ label, reason, ms }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Fail OPEN — see the note at the top of this file.
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
