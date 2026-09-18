#!/usr/bin/env python3
"""Pre-render every hero line to public/audio/<id>.wav.

Same voice settings as app/server.js's live speak(): Piper kk_KZ-issai-high,
speaker 3, then a pitch shift up by 1.4x with the duration restored
(asetrate + atempo) so the cub sounds young without talking faster.

Usage:
  python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements.txt
  tools/.venv/bin/python tools/prerender.py [--force] [--only intro,q_tracks]
"""
import argparse, json, os, subprocess, tempfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "audio"
VOICES = ROOT / "tools" / "voices"
VOICE_NAME = "kk_KZ-issai-high"
VOICE_URL = f"https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/kk/kk_KZ/issai/high/{VOICE_NAME}"
SPEAKER = 3
PITCH = 1.4
PIPER_BIN = ROOT / "tools" / ".venv" / "bin" / "piper"


def ensure_voice() -> Path:
    override = os.environ.get("PIPER_VOICE_KK")
    if override:
        return Path(override)
    VOICES.mkdir(parents=True, exist_ok=True)
    onnx = VOICES / f"{VOICE_NAME}.onnx"
    cfg = VOICES / f"{VOICE_NAME}.onnx.json"
    for dst, url in ((onnx, VOICE_URL + ".onnx"), (cfg, VOICE_URL + ".onnx.json")):
        if not dst.exists():
            print(f"downloading {url}")
            urllib.request.urlretrieve(url, dst)
    return onnx


def ffmpeg_bin() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def lines() -> dict:
    res = subprocess.run(["node", str(ROOT / "tools" / "dump-story.js")], check=True, capture_output=True, text=True)
    return json.loads(res.stdout)


def render(audio_id: str, text: str, voice: Path, ffmpeg: str) -> None:
    out = OUT_DIR / f"{audio_id}.wav"
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "raw.wav"
        subprocess.run(
            [str(PIPER_BIN), "-m", str(voice), "-f", str(raw), "--speaker", str(SPEAKER)],
            input=text.encode("utf-8"), check=True,
        )
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(raw),
             "-af", f"asetrate=22050*{PITCH},aresample=22050,atempo={1 / PITCH}", str(out)],
            check=True,
        )
    print(f"rendered {out.relative_to(ROOT)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-render even if the .wav exists")
    ap.add_argument("--only", help="comma-separated audio ids")
    args = ap.parse_args()

    voice = ensure_voice()
    ffmpeg = ffmpeg_bin()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wanted = lines()
    all_ids = set(wanted)
    if args.only:
        keep = set(args.only.split(","))
        wanted = {k: v for k, v in wanted.items() if k in keep}

    for audio_id, text in wanted.items():
        if not args.force and (OUT_DIR / f"{audio_id}.wav").exists():
            print(f"skip {audio_id} (exists)")
            continue
        render(audio_id, text, voice, ffmpeg)

    stale = sorted(p.name for p in OUT_DIR.glob("*.wav") if p.stem not in all_ids)
    if stale:
        print("stale (not in story):", ", ".join(stale))


if __name__ == "__main__":
    main()
