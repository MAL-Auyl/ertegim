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

export const config = { runtime: "edge" };

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_TIMEOUT_MS = 8000; // more headroom than local (no LAN, real internet round-trip)

function isMostlyCyrillic(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return true;
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) || [];
  return cyrillic.length / letters.length >= 0.6;
}

async function transcribeGroq(audioBuf, ext, hint) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const form = new FormData();
  form.append("file", new Blob([audioBuf]), `clip.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "kk");
  form.append("prompt", hint);
  form.append("temperature", "0");
  form.append("response_format", "json");

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
    const transcript = isMostlyCyrillic(raw) ? raw : "";
    return { transcript, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
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
    const hint = sttHintFor(nodeId, { brotherName });
    const { transcript, ms } = await transcribeGroq(buf, ext, hint);
    const { blocked, results } = checkBlocklist(transcript);
    return new Response(
      JSON.stringify({ transcript, blocked, blockDetails: results, ms, engine: "groq" }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
