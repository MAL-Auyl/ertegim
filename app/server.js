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

// Whisper sometimes hallucinates into a completely different language on
// short/unclear audio even with language=kk forced — a `prompt` hint
// biasing the decoder toward expected story vocabulary measurably reduces
// this (standard Whisper mitigation, not Kazakh-specific).
//
// The actual child answers were under-covered here: fox_question's entire
// answer space is the numbers 1-5 (kk and ru), and the owl's rhyme source
// can be either OWL_WORDS entry (app.js) — neither "бір/екі/үш/төрт/бес"
// nor "балық" were in the hint, so the decoder had zero bias toward the
// exact words it most needs to get right. Added below.
const GROQ_PROMPT =
  "Сәлем, түлкі, үкі, жидек, санау, ұйқас, мысық, балық, қасық, дұрыс, ойнайық, " +
  "бір, екі, үш, төрт, бес, один, два, три, четыре, пять";

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
// with whatever gain the mic captured at. Same Cyrillic-safe relative-path
// dance as everywhere else ffmpeg is spawned in this file (see comment on
// transcribeLocal): cwd=TOOLS, only ASCII relative segments in argv.
async function preprocessForSTT(audioBuf, ext) {
  const id = crypto.randomUUID();
  const rawAbs = `${TMP}/${id}.${ext}`;
  const wavAbs = `${TMP}/${id}_norm.wav`;
  const rawFromTools = `../../app/tmp/${id}.${ext}`;
  const wavFromTools = `../../app/tmp/${id}_norm.wav`;

  await Bun.write(rawAbs, audioBuf);
  try {
    const ff = Bun.spawnSync(
      [
        FFMPEG_REL, "-y", "-loglevel", "error", "-i", rawFromTools,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        wavFromTools,
      ],
      { cwd: TOOLS },
    );
    if (ff.exitCode !== 0) throw new Error(`ffmpeg loudnorm failed: ${new TextDecoder().decode(ff.stderr)}`);
    return await Bun.file(wavAbs).arrayBuffer();
  } finally {
    for (const p of [rawAbs, wavAbs]) {
      if (await Bun.file(p).exists()) await Bun.file(p).delete?.().catch(() => {});
    }
  }
}

async function transcribeGroq(audioBuf, ext) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  // Preprocessing is a best-effort quality boost, not a correctness
  // requirement — if ffmpeg/ext handling hiccups here, fall back to the
  // original raw blob rather than failing the whole transcription.
  let uploadBuf = audioBuf;
  let uploadName = `clip.${ext}`;
  try {
    uploadBuf = await preprocessForSTT(audioBuf, ext);
    uploadName = "clip.wav";
  } catch (err) {
    console.error(`STT preprocessing failed, sending raw audio: ${err}`);
  }

  const form = new FormData();
  form.append("file", new Blob([uploadBuf]), uploadName);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "kk");
  form.append("prompt", GROQ_PROMPT);
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
    const raw = (data.text || "").trim();
    // Whisper occasionally hallucinates into a completely different
    // language/script on poor audio despite language=kk — treat non-Cyrillic
    // output as a failed recognition rather than showing garbage.
    const transcript = isMostlyCyrillic(raw) ? raw : "";
    return { transcript, ms, engine: "groq" };
  } finally {
    clearTimeout(timer);
  }
}

// LLM answer classifier (Next Steps #5) — replaces the operator's manual
// Correct/Re-ask judgement with a real model call. Same Groq account as STT,
// but the chat-completions endpoint, not Whisper. Kept deliberately separate
// from the blocklist: the blocklist is a hard-coded, network-free safety gate
// that fails closed; this classifier only judges answer correctness and is
// allowed to fail OPEN (falls back to the operator's own buttons) since a
// wrong "неверно"/"верно" call here just means one extra re-ask, not a
// safety incident. See IDEA.md "Как закрываем риски".
// This Groq account has no llama-3.x chat access (checked via /v1/models) —
// gpt-oss-20b is the fastest model it does have access to, plenty for a
// 3-way classification call.
const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
const CLASSIFY_TIMEOUT_MS = 4000;

async function classifyAnswer(transcript, questionKk, criterion) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
  try {
    const t0 = performance.now();
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
    const ms = Math.round(performance.now() - t0);
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const label = ["correct", "incorrect", "unclear"].includes(parsed.label) ? parsed.label : "unclear";
    return { label, reason: String(parsed.reason || ""), ms };
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
        // Client sends the real extension for whatever MediaRecorder format
        // the browser actually supports (Safari records mp4/m4a, not webm —
        // labeling it "webm" anyway corrupts decoding on both ends).
        const clientExt = audio.name?.split(".").pop();
        const ext = clientExt && /^[a-z0-9]{2,5}$/i.test(clientExt) ? clientExt : "webm";
        const { transcript, ms, engine } = await transcribe(buf, ext);
        const { blocked, results } = checkBlocklist(transcript);
        return Response.json({ transcript, blocked, blockDetails: results, ms, engine });
      } catch (err) {
        console.error(err);
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    if (url.pathname === "/api/classify" && req.method === "POST") {
      try {
        const { transcript, questionKk, criterion } = await req.json();
        if (typeof transcript !== "string" || typeof questionKk !== "string" || typeof criterion !== "string") {
          return Response.json({ error: "missing transcript/questionKk/criterion field" }, { status: 400 });
        }
        const { label, reason, ms } = await classifyAnswer(transcript, questionKk, criterion);
        return Response.json({ label, reason, ms });
      } catch (err) {
        console.error(`classify failed (falling back to operator): ${err}`);
        // Fail OPEN: the frontend treats a non-200/error response as "AI
        // unavailable" and silently leaves the manual Correct/Re-ask/Advance
        // buttons as the only path — see comment above classifyAnswer().
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
