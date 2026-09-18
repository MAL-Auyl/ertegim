#!/usr/bin/env bun
// WoZ operator server (Next Steps #3-4). Serves the confirm screen and runs
// the two independent systems on every uploaded clip:
//   1. Automatic blocklist (fuzzy, no human) — fires BLOCKED on its own.
//   2. Transcript + audio handed to the operator for Correct/Re-ask/Advance.
import { mkdirSync } from "node:fs";

import { checkBlocklist } from "../lib/blocklist-core.js";
import { classifyAnswer, sanitizeClassifyInput } from "../lib/classify-core.js";
import { sttHintFor } from "../lib/stt-hints-core.js";
import { expectedForms, pickTranscript, filterHallucinations } from "../lib/stt-pick.js";

import { resolveBins, describeBins } from "./bins.js";
import { safeStaticPath } from "./static.js";

const ROOT = `${import.meta.dir}/`;
const TMP = `${ROOT}tmp`;
const PUBLIC = `${ROOT}../public`;
const PORT = Number(process.env.PORT) || 3000;

mkdirSync(TMP, { recursive: true });

// Native helpers are optional: each feature below degrades on its own when
// its binary is missing (see server/bins.js). Windows note: whisper-cli /
// ffmpeg mangle non-ASCII argv, so every spawn runs with cwd=TMP and passes
// only the ASCII (UUID) file names relative to it — the project's own path
// (which may be Cyrillic) never appears in argv.
const bins = resolveBins();
console.log("native helpers:\n  " + describeBins(bins).join("\n  "));

// Bun.serve handles every request on one JS thread, so a hung child process
// (malformed audio, a stuck ffmpeg/whisper-cli invocation) would otherwise
// block ALL in-flight requests indefinitely — every spawnSync call below
// gets a timeout for the same reason every network call in this file does.
const SPAWN_TIMEOUT_MS = 20000;

// Groq (whisper-large-v3-turbo, cloud) — noticeably more accurate and ~4x
// faster than local Whisper-small on real Kazakh speech in side-by-side
// testing (2026-09-04), and far more robust to noisy audio (local Whisper
// fell into a repetition loop on a noisy sample where Groq stayed
// coherent). Used as the primary engine when GROQ_API_KEY is set; local
// Whisper is the fallback so the demo still works with zero network/cloud
// dependency if Groq is unreachable or the key is missing/rate-limited.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_TIMEOUT_MS = 5000;

function isMostlyCyrillic(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return true; // empty/no letters — nothing to reject
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu) || [];
  return cyrillic.length / letters.length >= 0.6;
}

// Loudness-normalize + downmix to 16kHz mono before STT — the local Whisper
// path (transcribeLocal below) already did this via ffmpeg; the Groq path
// was sending the raw browser MediaRecorder blob untouched. A quiet/muffled
// child voice sits well below adult speaking level, and loudnorm (EBU R128)
// brings it up to a consistent target instead of relying on Whisper to cope
// with whatever gain the mic captured at. highpass=80 drops room rumble and
// desk thumps and afftdn takes out steady fan/laptop hiss FIRST, so loudnorm
// then raises the child's voice rather than the noise floor — a raised noise
// floor is exactly what makes Whisper hallucinate subtitle credits.
// Spawned with cwd=TMP and ASCII-only
// relative names in argv (see the note at the top of this file).
// afftdn is the fragile link in the chain (it is not built into every ffmpeg,
// and it fails outright on very short clips) — and losing the whole
// preprocessing pass because of the denoiser means sending Whisper the raw,
// un-normalized child voice, which is the worst of the three options. So:
// full chain → chain without afftdn → raw clip, in that order.
const FILTER_CHAINS = [
  ["highpass+afftdn+loudnorm", "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11"],
  ["highpass+loudnorm", "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11"],
];

async function preprocessForSTT(audioBuf, ext) {
  if (!bins.ffmpeg) return audioBuf; // no ffmpeg → send the raw clip as-is
  const id = crypto.randomUUID();
  const rawName = `${id}.${ext}`;
  const wavName = `${id}_norm.wav`;
  await Bun.write(`${TMP}/${rawName}`, audioBuf);
  try {
    let lastErr = null;
    for (const [name, chain] of FILTER_CHAINS) {
      const ff = Bun.spawnSync(
        [bins.ffmpeg, "-y", "-loglevel", "error", "-i", rawName,
         "-af", chain, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavName],
        { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
      );
      if (ff.exitCode === 0) {
        console.log(`stt preprocessing: ${name}`);
        return await Bun.file(`${TMP}/${wavName}`).arrayBuffer();
      }
      lastErr = new Error(`ffmpeg ${name} failed: ${new TextDecoder().decode(ff.stderr)}`);
      console.warn(`stt preprocessing: ${name} failed, trying next chain`);
    }
    throw lastErr; // prepareUpload() logs and falls back to the raw clip
  } finally {
    for (const n of [rawName, wavName]) await Bun.file(`${TMP}/${n}`).delete?.().catch(() => {});
  }
}

const GROQ_STT_MODEL = "whisper-large-v3-turbo";

// One Groq call on an already-prepared upload buffer. Split out of
// transcribeGroq so transcribeDual can preprocess the clip ONCE and then run
// the kk and ru passes over the same wav in parallel (ffmpeg is the slow part
// and the audio is identical for both languages).
async function groqCall(uploadBuf, uploadName, hint, lang, model = GROQ_STT_MODEL) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const t0 = performance.now();
  const form = new FormData();
  form.append("file", new Blob([uploadBuf]), uploadName);
  form.append("model", model);
  form.append("language", lang);
  form.append("prompt", hint);
  form.append("temperature", "0");
  // verbose_json is what carries per-segment no_speech_prob / avg_logprob —
  // the numbers lib/stt-pick.js needs to tell "the child said nothing" from
  // "the child said something I'm unsure about".
  form.append("response_format", "verbose_json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`groq http ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    const raw = (data.text || "").trim();
    // Whisper occasionally hallucinates into a completely different
    // language/script on poor audio despite the language hint — treat
    // non-Cyrillic output as a failed recognition rather than showing garbage.
    const text = isMostlyCyrillic(raw) ? raw : "";
    const segments = Array.isArray(data.segments) ? data.segments : [];
    // No segments at all on an empty result means Whisper heard nothing —
    // report that as maximum no-speech rather than as a confident silence.
    const noSpeechProb = segments.length
      ? Math.max(...segments.map((s) => Number(s.no_speech_prob) || 0))
      : (text ? 0 : 1);
    // Absent avg_logprob → null, never 0: 0 is "Whisper was certain", which
    // would hand a silent clip a free confidence bonus (see confidenceOf).
    const lps = segments.map((s) => Number(s.avg_logprob)).filter((n) => Number.isFinite(n));
    const avgLogprob = lps.length ? lps.reduce((a, b) => a + b, 0) / lps.length : null;
    return { text, lang, noSpeechProb, avgLogprob, ms, engine: "groq" };
  } finally {
    clearTimeout(timer);
  }
}

async function prepareUpload(audioBuf, ext) {
  // Preprocessing is a best-effort quality boost, not a correctness
  // requirement — if ffmpeg/ext handling hiccups here, fall back to the
  // original raw blob rather than failing the whole transcription.
  try {
    const uploadBuf = await preprocessForSTT(audioBuf, ext);
    return { uploadBuf, uploadName: bins.ffmpeg ? "clip.wav" : `clip.${ext}` };
  } catch (err) {
    console.error(`STT preprocessing failed, sending raw audio: ${err}`);
    return { uploadBuf: audioBuf, uploadName: `clip.${ext}` };
  }
}

async function transcribeGroq(audioBuf, ext, hint, lang = "kk", model = GROQ_STT_MODEL) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  // t0 starts before preprocessing so the reported `ms` is comparable to
  // transcribeLocal's, which times its own ffmpeg step too.
  const t0 = performance.now();
  const { uploadBuf, uploadName } = await prepareUpload(audioBuf, ext);
  const out = await groqCall(uploadBuf, uploadName, hint, lang, model);
  return { ...out, transcript: out.text, ms: Math.round(performance.now() - t0) };
}

// Ask Whisper the same clip twice — kk and ru — in parallel, then let
// lib/stt-pick.js decide which recognition the story should believe. Children
// here answer in either language (often mixing both inside one sentence), and
// a single language=kk pass mangles a Russian "три" into Kazakh-shaped noise.
async function transcribeDual(audioBuf, ext, hint, expected, model = GROQ_STT_MODEL) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const t0 = performance.now();
  const { uploadBuf, uploadName } = await prepareUpload(audioBuf, ext);
  const settled = await Promise.allSettled(
    ["kk", "ru"].map((lang) => groqCall(uploadBuf, uploadName, hint, lang, model)),
  );
  const candidates = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (candidates.length === 0) {
    // Both passes failed → throw so transcribe() can fall back to local
    // Whisper exactly as it did before this change.
    throw settled[0].reason;
  }
  const picked = pickTranscript(candidates, expected);
  return {
    ...picked,
    candidates,
    ms: Math.round(performance.now() - t0),
    engine: "groq",
  };
}

// The LLM answer classifier itself (prompt, model, timeout, input caps)
// lives in lib/classify-core.js, shared verbatim with api/classify.js so the
// Vercel deployment and this local server can never judge the same answer
// differently. See that file for why it is allowed to fail OPEN.

async function transcribe(audioBuf, ext, hint, expected) {
  try {
    return await transcribeDual(audioBuf, ext, hint, expected);
  } catch (err) {
    console.error(`Groq STT failed, falling back to local Whisper: ${err}`);
    try {
      const local = await transcribeLocal(audioBuf, ext);
      // Local Whisper is kk-only and reports no confidence numbers — fill the
      // dual-path shape so the handler and the client stay uniform.
      return {
        ...local, engine: "local", lang: "kk", score: 0, confidence: 0,
        lowConfidence: false, candidates: [{ lang: "kk", text: local.transcript }],
      };
    } catch (localErr) {
      throw new Error(`${localErr.message}; groq: ${err.message}`, { cause: err });
    }
  }
}

// Spawned with cwd=TMP and ASCII-only relative names in argv.
async function transcribeLocal(audioBuf, ext) {
  if (!bins.ffmpeg || !bins.whisper || !bins.whisperModel) {
    throw new Error("local whisper unavailable (need ffmpeg + whisper-cli + WHISPER_MODEL)");
  }
  const id = crypto.randomUUID();
  const rawName = `${id}.${ext}`, wavName = `${id}.wav`, txtName = `${id}.txt`;
  await Bun.write(`${TMP}/${rawName}`, audioBuf);
  const t0 = performance.now();
  try {
    const ff = Bun.spawnSync(
      [bins.ffmpeg, "-y", "-loglevel", "error", "-i", rawName, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavName],
      { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
    );
    if (ff.exitCode !== 0) throw new Error(`ffmpeg failed: ${new TextDecoder().decode(ff.stderr)}`);
    const wh = Bun.spawnSync(
      [bins.whisper, "-m", bins.whisperModel, "-l", "kk", "-f", wavName, "-otxt", "-of", id, "-nt"],
      { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
    );
    if (wh.exitCode !== 0) throw new Error(`whisper-cli failed: ${new TextDecoder().decode(wh.stderr)}`);
    const transcript = (await Bun.file(`${TMP}/${txtName}`).text()).trim();
    return { transcript, ms: Math.round(performance.now() - t0) };
  } finally {
    for (const n of [rawName, wavName, txtName]) await Bun.file(`${TMP}/${n}`).delete?.().catch(() => {});
  }
}

// kk_KZ-issai-high is a 6-speaker model; ids 2,3,4,5 are labeled female
// (F3, Raya/F1, F1, F2) but sound near-identical to each other in practice —
// weak speaker conditioning in this checkpoint. Speaker id alone doesn't
// reliably move "how female/child-like it sounds", so we also pitch-shift
// the output up with ffmpeg (asetrate+atempo trick — raises pitch, then
// time-stretches back to the original duration so speech rate is unchanged).
const HERO_SPEAKER = 3;
const PITCH_FACTOR = 1.4; // ~+6 semitones — asetrate shifts formants too, not just pitch,
// which is actually closer to a real child voice (smaller vocal tract) than a
// formant-preserving shift would be. Tune here if it reads too "chipmunk."

async function speak(text, speakerId = HERO_SPEAKER) {
  if (!bins.piper || !bins.piperVoice) {
    const err = new Error("piper unavailable (PIPER_BIN / PIPER_VOICE_KK)");
    err.status = 503;
    throw err;
  }
  const id = crypto.randomUUID();
  const rawName = `${id}_raw.wav`, outName = `${id}.wav`;
  const t0 = performance.now();
  try {
    const proc = Bun.spawnSync(
      [bins.piper, "-m", bins.piperVoice, "-f", rawName, "--speaker", String(speakerId)],
      { cwd: TMP, stdin: new TextEncoder().encode(text), timeout: SPAWN_TIMEOUT_MS },
    );
    if (proc.exitCode !== 0) throw new Error(`piper failed: ${new TextDecoder().decode(proc.stderr)}`);
    let outFile = rawName;
    if (bins.ffmpeg) {
      const pitch = Bun.spawnSync(
        [bins.ffmpeg, "-y", "-loglevel", "error", "-i", rawName,
         "-af", `asetrate=22050*${PITCH_FACTOR},aresample=22050,atempo=${1 / PITCH_FACTOR}`, outName],
        { cwd: TMP, timeout: SPAWN_TIMEOUT_MS },
      );
      if (pitch.exitCode !== 0) throw new Error(`ffmpeg pitch-shift failed: ${new TextDecoder().decode(pitch.stderr)}`);
      outFile = outName;
    }
    const bytes = await Bun.file(`${TMP}/${outFile}`).arrayBuffer();
    return { bytes, ms: Math.round(performance.now() - t0) };
  } finally {
    for (const n of [rawName, outName]) await Bun.file(`${TMP}/${n}`).delete?.().catch(() => {});
  }
}

const LAB_PATHS = new Set(["/lab.html", "/lab/stt-pick.js", "/api/lab/transcribe"]);

function isLoopbackRequest(req) {
  const host = String(req.headers.get("host") || "").toLowerCase();
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/speak" && req.method === "POST") {
      try {
        const { text, speaker } = await req.json();
        if (!text || typeof text !== "string") {
          return Response.json({ error: "missing text field" }, { status: 400 });
        }
        const sp = Number.isInteger(speaker) && speaker >= 0 && speaker <= 5 ? speaker : HERO_SPEAKER;
        const { bytes, ms } = await speak(text, sp);
        return new Response(bytes, {
          headers: { "Content-Type": "audio/wav", "X-Synth-Ms": String(ms) },
        });
      } catch (err) {
        console.error(err);
        return Response.json({ error: String(err) }, { status: err.status || 500 });
      }
    }

    if (url.pathname === "/api/transcribe" && req.method === "POST") {
      try {
        const form = await req.formData();
        const audio = form.get("audio");
        if (!audio || typeof audio === "string") {
          return Response.json({ error: "missing audio field" }, { status: 400 });
        }
        const buf = new Uint8Array(await audio.arrayBuffer());
        // Client sends the real extension for whatever MediaRecorder format
        // the browser actually supports (Safari records mp4/m4a, not webm —
        // labeling it "webm" anyway corrupts decoding on both ends).
        const clientExt = audio.name?.split(".").pop();
        const ext = clientExt && /^[a-z0-9]{2,5}$/i.test(clientExt) ? clientExt : "webm";
        const nodeId = typeof form.get("nodeId") === "string" ? form.get("nodeId") : "";
        const brotherName = typeof form.get("brotherName") === "string" ? form.get("brotherName") : "";
        const trackCount = Number(form.get("trackCount")) || 0;
        const hint = sttHintFor(nodeId, { brotherName });
        const expected = expectedForms(nodeId, { trackCount, brotherName });
        const out = await transcribe(buf, ext, hint, expected);
        // Hallucinated passes ("Субтитры сделал DimaTorzok") never leave the
        // server: they are not a second opinion for the classifier, and
        // running the blocklist over them only invents matches.
        const alternatives = filterHallucinations(
          (out.candidates || []).map((c) => ({ lang: c.lang, text: c.text })),
        );
        const kk = alternatives.find((a) => a.lang === "kk")?.text ?? "";
        const ru = alternatives.find((a) => a.lang === "ru")?.text ?? "";
        console.log(
          `stt kk="${kk}" ru="${ru}" → ${out.lang || "-"} route=${out.route || "-"} score=${out.score ?? 0} conf=${out.confidence ?? 0}`,
        );
        // A low-confidence pick is still blocklist-checked (safety never runs
        // on a subset of what the child might have said) — but per transcript,
        // never on a joined string: joining lets the last word of one
        // recognition and the first of the next form a "phrase" nobody said,
        // and it also hides which transcript actually tripped the list.
        const checks = [out.transcript, ...alternatives.map((a) => a.text)]
          .filter((t) => typeof t === "string" && t.trim())
          .map((t) => checkBlocklist(t));
        const blocked = checks.some((c) => c.blocked);
        const firstBlocked = checks.find((c) => c.blocked);
        return Response.json({
          transcript: out.transcript || "",
          lang: out.lang || null,
          route: out.route ?? null,
          confidence: out.confidence ?? 0,
          lowConfidence: !!out.lowConfidence,
          alternatives,
          blocked,
          blockDetails: firstBlocked ? firstBlocked.results : (checks[0]?.results ?? []),
          ms: out.ms,
          engine: out.engine,
        });
      } catch (err) {
        console.error(err);
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    // The lab is a local tuning tool, not part of the product: it burns Groq
    // credit per click and exposes an unmetered transcription endpoint. On a
    // laptop serving the demo over the LAN (phone/tablet as the child's
    // screen) those routes would otherwise be open to everyone on the
    // network, so anything that did not arrive as localhost gets a flat 403.
    if (LAB_PATHS.has(url.pathname) && !isLoopbackRequest(req)) {
      return new Response("Лаборатория доступна только локально", { status: 403 });
    }

    // Local-only STT tuning lab (see README «Лаборатория STT»): batch-run
    // real child recordings through both Whisper models and both languages
    // and see, per file, what each pass heard and which one the picker took.
    // Never shipped to Vercel — it exists to tune stt-pick.js against actual
    // kids' voices instead of guesses.
    if (url.pathname === "/lab.html" && req.method === "GET") {
      return new Response(Bun.file(`${ROOT}lab.html`), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    // The page imports the picker as a module so its "did it match?" column
    // uses exactly the server's phonetic/Levenshtein rules, not a copy.
    if (url.pathname === "/lab/stt-pick.js" && req.method === "GET") {
      return new Response(Bun.file(`${ROOT}../lib/stt-pick.js`), {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/lab/transcribe" && req.method === "POST") {
      try {
        const form = await req.formData();
        const audio = form.get("audio");
        if (!audio || typeof audio === "string") {
          return Response.json({ error: "missing audio field" }, { status: 400 });
        }
        const buf = new Uint8Array(await audio.arrayBuffer());
        const clientExt = audio.name?.split(".").pop();
        const ext = clientExt && /^[a-z0-9]{2,5}$/i.test(clientExt) ? clientExt : "webm";
        const nodeId = String(form.get("nodeId") || "");
        const trackCount = Number(form.get("trackCount")) || 0;
        const model = form.get("model") === "whisper-large-v3"
          ? "whisper-large-v3"
          : GROQ_STT_MODEL;
        const hint = sttHintFor(nodeId, { brotherName: String(form.get("brotherName") || "") });
        const expected = expectedForms(nodeId, { trackCount });
        const out = await transcribeDual(buf, ext, hint, expected, model);
        const byLang = (l) => out.candidates.find((c) => c.lang === l) || {};
        return Response.json({
          model,
          kk: byLang("kk").text ?? "",
          ru: byLang("ru").text ?? "",
          picked: out.transcript,
          lang: out.lang,
          score: out.score,
          confidence: out.confidence,
          lowConfidence: out.lowConfidence,
          ms: out.ms,
        });
      } catch (err) {
        console.error(err);
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/classify" && req.method === "POST") {
      try {
        const input = sanitizeClassifyInput(await req.json());
        if (!input.valid) {
          return Response.json({ error: "missing transcript/questionKk/criterion field" }, { status: 400 });
        }
        // Caps (transcript length, number of alternatives, expected forms)
        // are applied by sanitizeClassifyInput — this body goes straight into
        // an LLM prompt, so an oversized or repeated field is both a cost and
        // a prompt-injection surface.
        const { label, reason, ms } = await classifyAnswer({
          apiKey: GROQ_API_KEY,
          transcript: input.transcript,
          questionKk: input.questionKk,
          criterion: input.criterion,
          alternatives: input.alternatives,
          expectedForms: input.expectedForms,
        });
        return Response.json({ label, reason, ms });
      } catch (err) {
        console.error(`classify failed (falling back to operator): ${err}`);
        // Fail OPEN: the frontend treats a non-200/error response as "AI
        // unavailable" and silently leaves the manual Correct/Re-ask/Advance
        // buttons as the only path — see the note in lib/classify-core.js.
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    // Static file serving from public/
    const filePath = safeStaticPath(PUBLIC, url.pathname);
    if (filePath) {
      const file = Bun.file(filePath);
      if (await file.exists()) return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Ертегім: http://localhost:${PORT}`);
