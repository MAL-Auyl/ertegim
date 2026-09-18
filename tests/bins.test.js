const { test, expect } = require("bun:test");

const root = "/repo";
function mk(overrides = {}) {
  const found = overrides.found || {};
  const files = new Set(overrides.files || []);
  return {
    which: (name) => found[name] || null,
    exists: (p) => files.has(p),
    platform: overrides.platform || "linux",
    root,
  };
}

test("env override wins over PATH", async () => {
  const { resolveBins } = await import("../server/bins.js");
  const b = resolveBins({ FFMPEG_BIN: "/opt/ffmpeg" }, mk({ found: { ffmpeg: "/usr/bin/ffmpeg" } }));
  expect(b.ffmpeg).toBe("/opt/ffmpeg");
});

test("PATH fallback, then imageio-ffmpeg from venv, then null", async () => {
  const { resolveBins } = await import("../server/bins.js");
  expect(resolveBins({}, mk({ found: { ffmpeg: "/usr/bin/ffmpeg" } })).ffmpeg).toBe("/usr/bin/ffmpeg");
  const venvBin = "/repo/tools/.venv/lib/python3.10/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2";
  expect(resolveBins({}, { ...mk(), globVenvFfmpeg: () => venvBin }).ffmpeg).toBe(venvBin);
  expect(resolveBins({}, { ...mk(), globVenvFfmpeg: () => null }).ffmpeg).toBeNull();
});

test("piper: venv bin on linux, Scripts/piper.exe on win32, PATH otherwise", async () => {
  const { resolveBins } = await import("../server/bins.js");
  expect(resolveBins({}, mk({ files: ["/repo/tools/.venv/bin/piper"] })).piper).toBe("/repo/tools/.venv/bin/piper");
  expect(resolveBins({}, mk({ platform: "win32", files: ["/repo/tools/.venv/Scripts/piper.exe"] })).piper).toBe("/repo/tools/.venv/Scripts/piper.exe");
  expect(resolveBins({}, mk({ found: { piper: "/usr/local/bin/piper" } })).piper).toBe("/usr/local/bin/piper");
  expect(resolveBins({}, mk()).piper).toBeNull();
});

test("voice and whisper model default to tools/ paths only if they exist", async () => {
  const { resolveBins } = await import("../server/bins.js");
  const b = resolveBins({}, mk({ files: ["/repo/tools/voices/kk_KZ-issai-high.onnx", "/repo/tools/models/ggml-small.bin"] }));
  expect(b.piperVoice).toBe("/repo/tools/voices/kk_KZ-issai-high.onnx");
  expect(b.whisperModel).toBe("/repo/tools/models/ggml-small.bin");
  expect(resolveBins({}, mk()).piperVoice).toBeNull();
  expect(resolveBins({ WHISPER_MODEL: "/m.bin" }, mk()).whisperModel).toBe("/m.bin");
});

test("describeBins lists every field", async () => {
  const { resolveBins, describeBins } = await import("../server/bins.js");
  const lines = describeBins(resolveBins({}, mk()));
  expect(lines.length).toBe(5);
  expect(lines.every((l) => l.includes("not found"))).toBe(true);
});
