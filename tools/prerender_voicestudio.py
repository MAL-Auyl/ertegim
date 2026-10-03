#!/usr/bin/env python3
"""Pre-render hero lines with VoiceStudio (OmniVoice) instead of Piper.

Needs the VoiceStudio desktop app running (backend on http://localhost:3900)
with the k2-fsa/OmniVoice model installed. Stdlib only — no venv needed.

OmniVoice's voice design ("female, child, very high pitch") is trained on
Chinese/English only and drifts on Kazakh, while cloning is its stable mode.
So the default voice is built in two steps:
  1. --make-ref: design the cub's voice on an ENGLISH sentence → tools/voice-ref/fox_ref_en.wav
  2. render every Kazakh line by cloning that reference (cross-language cloning).
In a Whisper round-trip test (2026-09-28) this beat both plain design-on-Kazakh
and cloning the current Piper audio on the long intro line.

Licence: OmniVoice weights are CC-BY-NC — fine for demos/testing, NOT for a
paid product. Piper (tools/prerender.py) stays the default engine for that reason.

Usage:
  python tools/prerender_voicestudio.py --make-ref            # once; listen to the ref
  python tools/prerender_voicestudio.py                       # → tools/voices/samples/voicestudio/full/
  python tools/prerender_voicestudio.py --only intro,q_tracks --force
  python tools/prerender_voicestudio.py --mode design         # no reference, instruct only
  python tools/prerender_voicestudio.py --to-public --force   # overwrite public/audio/*.wav
"""
import argparse, io, json, os, subprocess, sys, time, urllib.error, urllib.request, uuid, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = os.environ.get("VOICESTUDIO_URL", "http://localhost:3900")
REF_DIR = ROOT / "tools" / "voice-ref"
REF_WAV = REF_DIR / "fox_ref_en.wav"
REF_TEXT = "Hello! I am a little fox. My baby brother is lost, will you help me find him?"
INSTRUCT = "female, child, very high pitch"
SAMPLES_DIR = ROOT / "tools" / "voices" / "samples" / "voicestudio" / "full"
PUBLIC_DIR = ROOT / "public" / "audio"


def lines() -> dict:
    res = subprocess.run(["node", str(ROOT / "tools" / "dump-story.js")], check=True, capture_output=True, text=True, encoding="utf-8")
    return json.loads(res.stdout)


def multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = bytearray()
    for name, value in fields.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        out += str(value).encode("utf-8") + b"\r\n"
    for name, path in files.items():
        out += (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'
                "Content-Type: audio/wav\r\n\r\n").encode()
        out += path.read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def generate(text: str, out: Path, **kw) -> None:
    audio, took = request(text, **kw)
    with wave.open(io.BytesIO(audio)) as w:
        sec = w.getnframes() / w.getframerate()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(audio)
    print(f"rendered {out.relative_to(ROOT)} ({sec:.1f}s audio, {took:.1f}s)")


def request(text: str, *, language: str, seed: int, instruct: str | None = None,
            ref: Path | None = None, ref_text: str | None = None) -> tuple[bytes, float]:
    fields = {"text": text, "language": language, "seed": seed}
    files = {}
    if instruct:
        fields["instruct"] = instruct
    if ref:
        files["ref_audio"] = ref
        if ref_text:
            fields["ref_text"] = ref_text
    body, ctype = multipart(fields, files)
    req = urllib.request.Request(f"{API}/generate", data=body, headers={"Content-Type": ctype}, method="POST")
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            audio = res.read()
    except urllib.error.HTTPError as err:
        sys.exit(f"VoiceStudio http {err.code}: {err.read().decode('utf-8', 'replace')}")
    return audio, time.monotonic() - t0


def check_backend() -> None:
    try:
        with urllib.request.urlopen(f"{API}/health", timeout=5) as res:
            health = json.load(res)
    except OSError as err:
        sys.exit(f"VoiceStudio is not reachable at {API} ({err}). Start the VoiceStudio app first.")
    print(f"VoiceStudio {health.get('version')} on {health.get('device')}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--make-ref", action="store_true", help=f"(re)design the reference voice into {REF_WAV.relative_to(ROOT)}")
    ap.add_argument("--mode", choices=["clone", "design"], default="clone")
    ap.add_argument("--instruct", default=INSTRUCT, help="voice-design attributes (English, comma-separated)")
    ap.add_argument("--ref", type=Path, default=REF_WAV, help="reference clip for --mode clone (3-10 s)")
    ap.add_argument("--ref-text", default=REF_TEXT, help="exact transcript of --ref")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--only", help="comma-separated audio ids")
    ap.add_argument("--force", action="store_true", help="re-render even if the .wav exists")
    ap.add_argument("--to-public", action="store_true", help=f"write into {PUBLIC_DIR.relative_to(ROOT)} instead of the samples folder")
    ap.add_argument("--out-dir", type=Path, help=f"output folder (default {SAMPLES_DIR.relative_to(ROOT)})")
    args = ap.parse_args()

    check_backend()

    if args.make_ref:
        generate(REF_TEXT, REF_WAV, language="en", seed=args.seed, instruct=args.instruct)
        return

    if args.mode == "clone" and not args.ref.exists():
        sys.exit(f"{args.ref} not found — run with --make-ref first")

    out_dir = PUBLIC_DIR if args.to_public else (args.out_dir.resolve() if args.out_dir else SAMPLES_DIR)
    wanted = lines()
    if args.only:
        keep = set(args.only.split(","))
        wanted = {k: v for k, v in wanted.items() if k in keep}

    for audio_id, text in wanted.items():
        out = out_dir / f"{audio_id}.wav"
        if not args.force and out.exists():
            print(f"skip {audio_id} (exists)")
            continue
        if args.mode == "clone":
            generate(text, out, language="kk", seed=args.seed, ref=args.ref, ref_text=args.ref_text)
        else:
            generate(text, out, language="kk", seed=args.seed, instruct=args.instruct)


if __name__ == "__main__":
    main()
