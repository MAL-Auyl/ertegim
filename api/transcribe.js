// Vercel Edge Function — cloud-only counterpart to server/server.js's
// /api/transcribe route. No native binaries here (Piper/Whisper.cpp/ffmpeg
// can't run on Vercel Edge), so this is Groq-only: same STT engine that's
// already primary in the local server, just without the local-Whisper
// fallback (nothing to fall back to on a serverless platform) and without
// the ffmpeg loudnorm preprocessing pass server/server.js applies before
// sending audio to Groq (no ffmpeg binary available here — the raw browser
// MediaRecorder blob is sent as-is). The Web-standard Request/Response API
// on Edge runtime maps almost 1:1 to the Bun code.
//
// Blocklist logic lives in ../lib/blocklist-core.js, shared with
// server/server.js via lib/blocklist-cli.js — see that file for why the matching
// logic had to be split out of the Bun-only CLI entry point.

import { checkBlocklist } from "../lib/blocklist-core.js";
import { sttHintFor } from "../lib/stt-hints-core.js";
import { expectedForms, pickTranscript, filterHallucinations } from "../lib/stt-pick.js";

export const config = { runtime: "edge" };

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_TIMEOUT_MS = 8000; // more headroom than local (no LAN, real internet round-trip)

function isMostlyCyrillic(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return true;
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) || [];
  return cyrillic.length / letters.length >= 0.6;
}

async function transcribeGroq(audioBuf, ext, hint, lang) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const form = new FormData();
  form.append("file", new Blob([audioBuf]), `clip.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", lang);
  form.append("prompt", hint);
  form.append("temperature", "0");
  // verbose_json carries per-segment no_speech_prob / avg_logprob, which
  // lib/stt-pick.js turns into the lowConfidence flag the client re-asks on.
  form.append("response_format", "verbose_json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const t0 = Date.now();
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`groq http ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const raw = (data.text || "").trim();
    const text = isMostlyCyrillic(raw) ? raw : "";
    const segments = Array.isArray(data.segments) ? data.segments : [];
    const noSpeechProb = segments.length
      ? Math.max(...segments.map((s) => Number(s.no_speech_prob) || 0))
      : (text ? 0 : 1);
    // Absent avg_logprob → null, never 0 (0 = "Whisper was certain", which
    // would give a silent clip a free confidence bonus — see confidenceOf).
    const lps = segments.map((s) => Number(s.avg_logprob)).filter((n) => Number.isFinite(n));
    const avgLogprob = lps.length ? lps.reduce((a, b) => a + b, 0) / lps.length : null;
    return { text, lang, noSpeechProb, avgLogprob, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// kk + ru in parallel, picked by lib/stt-pick.js — same contract as
// server/server.js's transcribeDual, minus the ffmpeg preprocessing (no
// native binaries on Edge) and minus the local-Whisper fallback (nothing to
// fall back to on a serverless platform: if both passes fail, so does the
// request, and the client drops into its manual/offline path).
async function transcribeDual(audioBuf, ext, hint, expected) {
  const t0 = Date.now();
  const settled = await Promise.allSettled(
    ["kk", "ru"].map((lang) => transcribeGroq(audioBuf, ext, hint, lang)),
  );
  const candidates = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (candidates.length === 0) throw settled[0].reason;
  return { ...pickTranscript(candidates, expected), candidates, ms: Date.now() - t0 };
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!audio || typeof audio === "string") {
      return new Response(JSON.stringify({ error: "missing audio field" }), { status: 400 });
    }
    const buf = new Uint8Array(await audio.arrayBuffer());
    // Client sends the real extension for whatever MediaRecorder format the
    // browser actually supports (Safari records mp4/m4a, not webm — trusting
    // a hardcoded "webm" here corrupts Groq's decoding of the upload).
    const clientExt = audio.name?.split(".").pop();
    const ext = clientExt && /^[a-z0-9]{2,5}$/i.test(clientExt) ? clientExt : "webm";
    const nodeId = typeof form.get("nodeId") === "string" ? form.get("nodeId") : "";
    const brotherName = typeof form.get("brotherName") === "string" ? form.get("brotherName") : "";
    const trackCount = Number(form.get("trackCount")) || 0;
    const hint = sttHintFor(nodeId, { brotherName });
    const expected = expectedForms(nodeId, { trackCount, brotherName });
    const out = await transcribeDual(buf, ext, hint, expected);
    // Hallucinated passes are dropped before anything downstream sees them —
    // they are not a second opinion for the classifier and they only invent
    // blocklist matches (same rule as server/server.js).
    const alternatives = filterHallucinations(
      out.candidates.map((c) => ({ lang: c.lang, text: c.text })),
    );
    const kk = alternatives.find((a) => a.lang === "kk")?.text ?? "";
    const ru = alternatives.find((a) => a.lang === "ru")?.text ?? "";
    console.log(`stt kk="${kk}" ru="${ru}" → ${out.lang || "-"} route=${out.route || "-"} score=${out.score} conf=${out.confidence}`);
    // Per transcript, never on a joined string: joining invents phrases across
    // the seam and hides which recognition actually tripped the list.
    const checks = [out.transcript, ...alternatives.map((a) => a.text)]
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => checkBlocklist(t));
    const blocked = checks.some((c) => c.blocked);
    const firstBlocked = checks.find((c) => c.blocked);
    return new Response(
      JSON.stringify({
        transcript: out.transcript || "",
        lang: out.lang || null,
        route: out.route ?? null,
        confidence: out.confidence,
        lowConfidence: out.lowConfidence,
        alternatives,
        blocked,
        blockDetails: firstBlocked ? firstBlocked.results : (checks[0]?.results ?? []),
        ms: out.ms,
        engine: "groq",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
