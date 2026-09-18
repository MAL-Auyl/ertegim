// Where the native helpers live. Order per binary: explicit env → PATH →
// the project's own tools/.venv (created for tools/prerender.py) → null.
// Nothing here is fatal: server.js degrades per binary (Groq-only STT,
// pre-rendered .wav instead of live Piper) and prints what it found.
import { join } from "node:path";
import { existsSync } from "node:fs";

const VOICE_DEFAULT = "tools/voices/kk_KZ-issai-high.onnx";
const WHISPER_MODEL_DEFAULT = "tools/models/ggml-small.bin";

function defaultGlobVenvFfmpeg(root) {
  // imageio-ffmpeg ships its binary as .../imageio_ffmpeg/binaries/ffmpeg-<platform>-v<ver>
  const patterns = [
    "tools/.venv/lib/python*/site-packages/imageio_ffmpeg/binaries/ffmpeg-*",
    "tools/.venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-*.exe",
  ];
  for (const p of patterns) {
    try {
      // dot: true — the venv lives under `tools/.venv`, and Bun.Glob skips
      // dot-directories by default, so without this nothing ever matches.
      for (const f of new Bun.Glob(p).scanSync({ cwd: root, dot: true })) return join(root, f);
    } catch {
      // root or venv missing — nothing to find
    }
  }
  return null;
}

function resolveBins(env = process.env, opts = {}) {
  const which = opts.which || ((n) => Bun.which(n));
  const exists = opts.exists || existsSync;
  const platform = opts.platform || process.platform;
  const root = opts.root || join(import.meta.dir, "..");
  const globVenvFfmpeg = opts.globVenvFfmpeg || (() => defaultGlobVenvFfmpeg(root));

  const ffmpeg = env.FFMPEG_BIN || which("ffmpeg") || globVenvFfmpeg() || null;
  const whisper = env.WHISPER_BIN || which("whisper-cli") || null;
  const modelDefault = join(root, WHISPER_MODEL_DEFAULT);
  const whisperModel = env.WHISPER_MODEL || (exists(modelDefault) ? modelDefault : null);

  const venvPiper = platform === "win32"
    ? join(root, "tools", ".venv", "Scripts", "piper.exe")
    : join(root, "tools", ".venv", "bin", "piper");
  const piper = env.PIPER_BIN || (exists(venvPiper) ? venvPiper : null) || which("piper") || null;
  const voiceDefault = join(root, VOICE_DEFAULT);
  const piperVoice = env.PIPER_VOICE_KK || (exists(voiceDefault) ? voiceDefault : null);

  return { ffmpeg, whisper, whisperModel, piper, piperVoice };
}

function describeBins(bins) {
  return Object.entries(bins).map(([k, v]) => `${k.padEnd(13)} ${v || "not found"}`);
}

export { resolveBins, describeBins };
