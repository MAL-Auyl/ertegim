#!/usr/bin/env bun
// WoZ operator server (Next Steps #3-4). Serves the confirm screen and runs
// the two independent systems on every uploaded clip:
//   1. Automatic blocklist (fuzzy, no human) — fires BLOCKED on its own.
//   2. Transcript + audio handed to the operator for Correct/Re-ask/Advance.
import { checkBlocklist } from "../spike/blocklist.js";

const ROOT = `${import.meta.dir}/`; // Bun-native, already decoded (handles Cyrillic paths)
const TMP = `${ROOT}tmp`;
const TOOLS = `${ROOT}../spike/tools`;

function findFfmpegRel() {
  const glob = new Bun.Glob("ffmpeg-*win64-gpl*/bin/ffmpeg.exe");
  for (const f of glob.scanSync({ cwd: TOOLS })) return f; // relative to TOOLS
  throw new Error("ffmpeg.exe not found under spike/tools — did setup finish?");
}

const FFMPEG_REL = findFfmpegRel(); // e.g. "ffmpeg-n8.1-latest-win64-gpl-8.1/bin/ffmpeg.exe"

// Groq (whisper-large-v3-turbo, cloud) — noticeably more accurate and ~4x
// faster than local Whisper-small on real Kazakh speech in side-by-side
// testing (2026-09-04), and far more robust to noisy audio (local Whisper
// fell into a repetition loop on a noisy sample where Groq stayed
// coherent). Used as the primary engine when GROQ_API_KEY is set; local
// Whisper is the fallback so the demo still works with zero network/cloud
// dependency if Groq is unreachable or the key is missing/rate-limited.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_TIMEOUT_MS = 5000;

async function transcribeGroq(audioBuf, ext) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const form = new FormData();
  form.append("file", new Blob([audioBuf]), `clip.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "kk");
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const t0 = performance.now();
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`groq http ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const ms = Math.round(performance.now() - t0);
    return { transcript: (data.text || "").trim(), ms, engine: "groq" };
  } finally {
    clearTimeout(timer);
  }
}

async function transcribe(audioBuf, ext) {
  try {
    return await transcribeGroq(audioBuf, ext);
  } catch (err) {
    console.error(`Groq STT failed, falling back to local Whisper: ${err}`);
    const local = await transcribeLocal(audioBuf, ext);
    return { ...local, engine: "local" };
  }
}

// whisper-cli.exe / ffmpeg.exe mangle non-ASCII (Cyrillic) argv on Windows
// when invoked via Bun.spawnSync. Fix: run with cwd=ROOT and pass only
// relative, ASCII-only path segments as args — the Cyrillic portion then
// lives solely in `cwd`, which Windows' CreateProcess handles correctly
// (only argv string-building is broken, not cwd).
async function transcribeLocal(audioBuf, ext) {
  const id = crypto.randomUUID(); // ASCII, safe as a filename
  // TOOLS is our spawn cwd (Ertegim/spike/tools); everything below is
  // expressed relative to it as "../../app/tmp/..." (spike/tools -> spike
  // -> Ertegim -> app/tmp), so no Cyrillic ever appears in argv.
  const rawFromTools = `../../app/tmp/${id}.${ext}`;
  const wavFromTools = `../../app/tmp/${id}.wav`;
  const outBaseFromTools = `../../app/tmp/${id}`;

  const rawAbs = `${TMP}/${id}.${ext}`;
  const wavAbs = `${TMP}/${id}.wav`;
  const txtAbs = `${TMP}/${id}.txt`;

  await Bun.write(rawAbs, audioBuf);

  const t0 = performance.now();

  const ff = Bun.spawnSync(
    [FFMPEG_REL, "-y", "-loglevel", "error", "-i", rawFromTools, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavFromTools],
    { cwd: TOOLS },
  );
  if (ff.exitCode !== 0) throw new Error(`ffmpeg failed: ${new TextDecoder().decode(ff.stderr)}`);

  const wh = Bun.spawnSync(
    ["whisper-bin/Release/whisper-cli.exe", "-m", "ggml-small.bin", "-l", "kk", "-f", wavFromTools, "-otxt", "-of", outBaseFromTools, "-nt"],
    { cwd: TOOLS },
  );
  if (wh.exitCode !== 0) throw new Error(`whisper-cli failed: ${new TextDecoder().decode(wh.stderr)}`);

  const transcript = (await Bun.file(txtAbs).text()).trim();
  const ms = Math.round(performance.now() - t0);

  for (const p of [rawAbs, wavAbs, txtAbs]) {
    if (await Bun.file(p).exists()) await Bun.file(p).delete?.().catch(() => {});
  }

  return { transcript, ms };
}

// Piper TTS (rhasspy/piper) — local, free, no API key. Lives outside the
// repo entirely at an ASCII-only path: piper.exe resolves its own
// espeak-ng-data folder via the exe's real location, and that resolution
// breaks on Cyrillic ("Рабочий стол") regardless of cwd/argv tricks — the
// only fix that actually worked was moving the binary itself off the
// Cyrillic path. Output files can still live back under the project path.
const PIPER_EXE = "C:/Users/zoomy/piper-tts/piper.exe";
const PIPER_VOICE_KK = "C:/Users/zoomy/piper-tts/voices/kk_KZ-issai-high.onnx";

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
  const id = crypto.randomUUID();
  const rawAbs = `${TMP}/${id}_raw.wav`;
  const outAbs = `${TMP}/${id}.wav`;
  const rawFromTools = `../../app/tmp/${id}_raw.wav`;
  const outFromTools = `../../app/tmp/${id}.wav`;

  const t0 = performance.now();
  const proc = Bun.spawnSync(
    [PIPER_EXE, "-m", PIPER_VOICE_KK, "-f", rawAbs, "--speaker", String(speakerId)],
    { stdin: new TextEncoder().encode(text) },
  );
  if (proc.exitCode !== 0) throw new Error(`piper failed: ${new TextDecoder().decode(proc.stderr)}`);

  const pitch = Bun.spawnSync(
    [
      FFMPEG_REL, "-y", "-loglevel", "error", "-i", rawFromTools,
      "-af", `asetrate=22050*${PITCH_FACTOR},aresample=22050,atempo=${1 / PITCH_FACTOR}`,
      outFromTools,
    ],
    { cwd: TOOLS },
  );
  if (pitch.exitCode !== 0) throw new Error(`ffmpeg pitch-shift failed: ${new TextDecoder().decode(pitch.stderr)}`);
  const ms = Math.round(performance.now() - t0);

  const bytes = await Bun.file(outAbs).arrayBuffer();
  await Bun.file(rawAbs).delete?.().catch(() => {});
  await Bun.file(outAbs).delete?.().catch(() => {});
  return { bytes, ms };
}

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/speak" && req.method === "POST") {
      try {
        const { text, speaker } = await req.json();
        if (!text || typeof text !== "string") {
          return Response.json({ error: "missing text field" }, { status: 400 });
        }
        const { bytes, ms } = await speak(text, speaker);
        return new Response(bytes, {
          headers: { "Content-Type": "audio/wav", "X-Synth-Ms": String(ms) },
        });
      } catch (err) {
        console.error(err);
        return Response.json({ error: String(err) }, { status: 500 });
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
        const { transcript, ms, engine } = await transcribe(buf, "webm");
        const { blocked, results } = checkBlocklist(transcript);
        return Response.json({ transcript, blocked, blockDetails: results, ms, engine });
      } catch (err) {
        console.error(err);
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    // Static file serving from public/
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`${ROOT}public${path}`);
    if (await file.exists()) return new Response(file);

    return new Response("Not found", { status: 404 });
  },
});

console.log("Ертегім WoZ screen: http://localhost:3000");
