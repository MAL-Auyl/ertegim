#!/usr/bin/env bun
// Next Steps #7 — pre-render the full happy-path hero lines to static WAV
// files so the stage demo has a fallback if live Piper/network lags.
// Reuses the same voice/pitch settings as app/server.js's speak().
//
// story.js is a classic (non-module) <script> consumed by the browser, so
// it can't use `export` — we extract STORY by evaluating its source text
// in a throwaway function scope instead of an ES import.

const ROOT = `${import.meta.dir}/../`;
const TOOLS = `${ROOT}spike/tools`;
const OUT_DIR = `${ROOT}app/public/audio`;

const storySrc = await Bun.file(`${ROOT}app/public/story.js`).text();
const STORY = new Function(`${storySrc}\nreturn STORY;`)();

function findFfmpegRel() {
  const glob = new Bun.Glob("ffmpeg-*win64-gpl*/bin/ffmpeg.exe");
  for (const f of glob.scanSync({ cwd: TOOLS })) return f;
  throw new Error("ffmpeg.exe not found under spike/tools");
}
const FFMPEG_REL = findFfmpegRel();

const PIPER_EXE = "C:/Users/zoomy/piper-tts/piper.exe";
const PIPER_VOICE_KK = "C:/Users/zoomy/piper-tts/voices/kk_KZ-issai-high.onnx";
const HERO_SPEAKER = 3;
const PITCH_FACTOR = 1.4;

async function renderOne(id, text) {
  const rawAbs = `${OUT_DIR}/${id}_raw.wav`;
  const outAbs = `${OUT_DIR}/${id}.wav`;
  const rawFromTools = `../../app/public/audio/${id}_raw.wav`;
  const outFromTools = `../../app/public/audio/${id}.wav`;

  const proc = Bun.spawnSync(
    [PIPER_EXE, "-m", PIPER_VOICE_KK, "-f", rawAbs, "--speaker", String(HERO_SPEAKER)],
    { stdin: new TextEncoder().encode(text) },
  );
  if (proc.exitCode !== 0) throw new Error(`piper failed for ${id}: ${new TextDecoder().decode(proc.stderr)}`);

  const pitch = Bun.spawnSync(
    [
      FFMPEG_REL, "-y", "-loglevel", "error", "-i", rawFromTools,
      "-af", `asetrate=22050*${PITCH_FACTOR},aresample=22050,atempo=${1 / PITCH_FACTOR}`,
      outFromTools,
    ],
    { cwd: TOOLS },
  );
  if (pitch.exitCode !== 0) throw new Error(`ffmpeg failed for ${id}: ${new TextDecoder().decode(pitch.stderr)}`);

  await Bun.file(rawAbs).delete?.().catch(() => {});
  console.log(`rendered ${id}.wav`);
}

async function main() {
  for (const [id, s] of Object.entries(STORY)) {
    if (!s.kk) continue;
    await renderOne(id, s.kk);
  }
  console.log("done");
}

main();
