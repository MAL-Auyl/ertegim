// Vercel Edge Function — cloud-only counterpart to app/server.js's
// /api/transcribe route. No native binaries here (Piper/Whisper.cpp can't
// run on Vercel), so this is Groq-only: same STT engine that's already
// primary in the local server, just without the local-Whisper fallback
// (nothing to fall back to on a serverless platform). The Web-standard
// Request/Response API on Edge runtime maps almost 1:1 to the Bun code.
//
// Blocklist logic is inlined (not imported from ../spike/blocklist.js)
// because that file uses `import.meta.main` for its CLI entry point — a
// Bun-only API with no CommonJS equivalent, which silently broke Vercel's
// ESM->CJS build (checkBlocklist came out undefined). Keep this in sync
// with spike/blocklist.js by hand if the matching logic changes.

export const config = { runtime: "edge" };

const TRIGGERS = [
  "маған ойыншық сатып бер", // "buy me a toy" — the scripted off-topic line
];

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

function normalize(text) {
  return text.toLowerCase().replace(/[.,!?;:()"'«»]/g, "").trim();
}

function tolerance(len) {
  if (len <= 3) return 1;
  if (len <= 6) return 1;
  return Math.max(2, Math.floor(len * 0.3));
}

function wordFuzzyMatch(triggerWord, transcriptWords) {
  for (const tw of transcriptWords) {
    const dist = levenshtein(triggerWord, tw);
    if (dist <= tolerance(triggerWord.length)) return { hit: true, matched: tw, dist };
  }
  return { hit: false };
}

function checkBlocklist(transcript, triggers = TRIGGERS, threshold = 0.5) {
  const transcriptWords = normalize(transcript).split(/\s+/).filter(Boolean);
  const results = [];
  for (const trigger of triggers) {
    const triggerWords = normalize(trigger).split(/\s+/).filter(Boolean);
    const matches = triggerWords.map((tw) => ({ word: tw, ...wordFuzzyMatch(tw, transcriptWords) }));
    const hitCount = matches.filter((m) => m.hit).length;
    const ratio = hitCount / triggerWords.length;
    if (ratio >= threshold && hitCount >= 2) results.push({ trigger, ratio, matches });
  }
  return { blocked: results.length > 0, results };
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_TIMEOUT_MS = 8000; // more headroom than local (no LAN, real internet round-trip)

// Whisper sometimes hallucinates into a completely different language on
// short/unclear audio even with language=kk forced — a `prompt` hint
// biasing the decoder toward expected story vocabulary measurably reduces
// this (standard Whisper mitigation, not Kazakh-specific).
const GROQ_PROMPT =
  "Сәлем, түлкі, үкі, жидек, санау, ұйқас, мысық, балық, қасық, дұрыс, ойнайық, " +
  "бір, екі, үш, төрт, бес, один, два, три, четыре, пять";

function isMostlyCyrillic(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return true;
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) || [];
  return cyrillic.length / letters.length >= 0.6;
}

async function transcribeGroq(audioBuf, ext) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const form = new FormData();
  form.append("file", new Blob([audioBuf]), `clip.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "kk");
  form.append("prompt", GROQ_PROMPT);
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
    const { transcript, ms } = await transcribeGroq(buf, ext);
    const { blocked, results } = checkBlocklist(transcript);
    return new Response(
      JSON.stringify({ transcript, blocked, blockDetails: results, ms, engine: "groq" }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
