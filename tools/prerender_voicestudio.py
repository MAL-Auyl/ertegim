#!/usr/bin/env python3
"""Pre-render hero lines with VoiceStudio (OmniVoice) — one voice per hero.

Needs the VoiceStudio desktop app running (backend on http://localhost:3900)
with the k2-fsa/OmniVoice model installed. Stdlib only — no venv needed
(ffmpeg is used if present, only to slow letter-lesson lines down).

OmniVoice's voice design ("female, child, very high pitch") is trained on
Chinese/English only and drifts on Kazakh, while cloning is its stable mode.
So every hero's voice is built in two steps:
  1. --make-ref: design the hero's voice on an ENGLISH sentence
     → tools/voice-ref/<hero>_ref_en.wav (fox, owl, bear);
  2. render every Kazakh line of that hero by cloning its reference
     (cross-language cloning).
In a Whisper round-trip test (2026-09-28) this beat both plain design-on-Kazakh
and cloning the current Piper audio on the long intro line.

Who says a line comes from public/story.js (tools/dump-story.js --meta), so
the owl's and the bear's lines get their own voices in every tale.

Each rendered line is level-matched to the Piper audio already in the app
(about -16 dBFS RMS, peaks under -1 dBFS), so a hero rendered here never
sounds louder or quieter than one still voiced by Piper.

Re-runs are incremental: a line is re-rendered only when its text, hero,
reference voice or settings changed (fingerprints in a small state file).

Licence: OmniVoice weights are CC-BY-NC — fine for demos, testing and a
non-commercial pilot, NOT for a paid product. Piper (tools/prerender.py)
stays the default engine for that reason.

Usage:
  python tools/prerender_voicestudio.py --make-ref                 # once: design missing hero voices
  python tools/prerender_voicestudio.py --make-ref owl --force     # redo one hero's voice
  python tools/prerender_voicestudio.py --characters owl,bear      # → samples folder + review.html
  python tools/prerender_voicestudio.py --characters owl,bear --to-public   # into the app
  python tools/prerender_voicestudio.py --only intro,q_tracks --force
  python tools/prerender_voicestudio.py --dry-run                  # what would be rendered, no backend

Per-hero voice from VoiceStudio's «Режиссёрский ИИ»: paste its taxonomy tokens
and speech-rate offset into tools/voice-ref/voices.json (see VOICES_FILE below),
then --make-ref <hero> --force and render again — changed heroes re-render.
"""
import argparse, array, hashlib, html, io, json, math, os, shutil, subprocess, sys, tempfile, time
import urllib.error, urllib.request, uuid, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = os.environ.get("VOICESTUDIO_URL", "http://localhost:3900")
REF_DIR = ROOT / "tools" / "voice-ref"
SAMPLES_DIR = ROOT / "tools" / "voices" / "samples" / "voicestudio" / "full"
PUBLIC_DIR = ROOT / "public" / "audio"
PUBLIC_STATE = ROOT / "tools" / "voice-ref" / "voicestudio-public-state.json"  # tracked, shared across machines

# One designed voice per hero. Attributes are OmniVoice voice-design terms
# (English only); the reference sentence is English for the same reason.
CHARACTERS = {
    "fox": {
        "instruct": "female, child, very high pitch",
        "ref_text": "Hello! I am a little fox. My baby brother is lost, will you help me find him?",
    },
    "owl": {
        "instruct": "female, teenager, moderate pitch",
        "ref_text": "Hello, my friend. I am a little owl. At night I look at the stars and sing to them.",
    },
    "bear": {
        "instruct": "male, young adult, low pitch",
        "ref_text": "Hello, little one! I am a big kind bear. I am so hungry, let us find some sweet honey.",
    },
}

# VoiceStudio's «Режиссёрский ИИ» (Director AI) turns a plain-language
# direction ("a big kind bear, low warm voice, slow") into taxonomy tokens and
# a speech-rate offset. Paste them per hero into tools/voice-ref/voices.json:
#   { "bear": { "instruct": "male, middle-aged, low pitch", "speed": "-10%" } }
# instruct → used when the hero's reference voice is designed (--make-ref);
# speed    → pace of every line of that hero (0.9, "0.9x", "-10%"; needs ffmpeg);
# ref_text → optional English sentence the reference is designed on.
VOICES_FILE = REF_DIR / "voices.json"


def parse_speed(value) -> float:
    """1.0 = as rendered; 0.9 / "0.9x" / "-10%" = 10 % slower; "+10%" = faster."""
    if value is None or value == "":
        return 1.0
    if isinstance(value, (int, float)):
        speed = float(value)
    else:
        text = str(value).strip().lower().replace(",", ".")
        if text.endswith("%"):
            speed = 1 + float(text[:-1]) / 100
        else:
            speed = float(text.rstrip("x"))
    if not 0.5 <= speed <= 2.0:
        raise ValueError(f"speed {value!r} is outside 0.5–2.0")
    return speed


def load_voice_overrides(path: Path = VOICES_FILE) -> dict:
    """Merge tools/voice-ref/voices.json into CHARACTERS (unknown heroes are an error)."""
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as err:
        sys.exit(f"{path.relative_to(ROOT)}: not valid JSON ({err})")
    for hero, cfg in data.items():
        if hero.startswith("_"):
            continue  # comments
        if hero not in CHARACTERS:
            sys.exit(f"{path.relative_to(ROOT)}: unknown hero {hero!r} — known: {', '.join(CHARACTERS)}")
        for key in ("instruct", "ref_text"):
            if cfg.get(key):
                CHARACTERS[hero][key] = str(cfg[key]).strip()
        CHARACTERS[hero]["speed"] = parse_speed(cfg.get("speed"))
    return data


TARGET_RMS_DBFS = -16.0   # Piper audio in public/audio measures about -15.4 dBFS RMS (median)
PEAK_CEILING_DBFS = -1.0
LESSON_TEMPO = 1 / 1.15   # same slowdown tools/prerender.py gives letter-lesson lines


def ref_path(character: str) -> Path:
    return REF_DIR / f"{character}_ref_en.wav"


def lines_meta() -> dict:
    res = subprocess.run(["node", str(ROOT / "tools" / "dump-story.js"), "--meta"],
                         check=True, capture_output=True, text=True, encoding="utf-8")
    return json.loads(res.stdout)


# ---------------------------------------------------------------- backend --
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


# ------------------------------------------------------------ audio post --
def read_pcm16(data: bytes) -> tuple[array.array, int, int]:
    with wave.open(io.BytesIO(data)) as w:
        if w.getsampwidth() != 2:
            raise ValueError(f"expected 16-bit PCM, got {8 * w.getsampwidth()}-bit")
        frames = array.array("h", w.readframes(w.getnframes()))
        return frames, w.getframerate(), w.getnchannels()


def write_pcm16(frames: array.array, rate: int, channels: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames.tobytes())
    return buf.getvalue()


def level_match(data: bytes, target_dbfs: float = TARGET_RMS_DBFS, ceiling_dbfs: float = PEAK_CEILING_DBFS) -> bytes:
    """Scale to the target RMS, never pushing a peak above the ceiling."""
    frames, rate, channels = read_pcm16(data)
    if not frames:
        return data
    rms = math.sqrt(sum(x * x for x in frames) / len(frames))
    peak = max(abs(x) for x in frames)
    if rms < 1 or peak < 1:
        return data
    gain = 10 ** (target_dbfs / 20) * 32768 / rms
    gain = min(gain, 10 ** (ceiling_dbfs / 20) * 32767 / peak)
    out = array.array("h", (max(-32768, min(32767, int(round(x * gain)))) for x in frames))
    return write_pcm16(out, rate, channels)


def find_ffmpeg() -> str | None:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # tools/.venv has it for tools/prerender.py
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 — optional
        return None


def slow_down(data: bytes, ffmpeg: str, tempo: float) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.wav", Path(tmp) / "out.wav"
        src.write_bytes(data)
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-af", f"atempo={tempo:.4f}", str(dst)], check=True)
        return dst.read_bytes()


def duration(data: bytes) -> float:
    with wave.open(io.BytesIO(data)) as w:
        return w.getnframes() / w.getframerate()


# ------------------------------------------------------------------ state --
def sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def fingerprint(text: str, character: str, args, ref: Path | None, tempo: float | None) -> str:
    parts = [text, character, args.mode, str(args.seed), CHARACTERS[character]["instruct"],
             sha1(ref.read_bytes()) if ref and ref.exists() else "-", f"{tempo or 1:.4f}",
             "" if args.no_normalize else f"{TARGET_RMS_DBFS}/{PEAK_CEILING_DBFS}"]
    return sha1("\x1f".join(parts).encode("utf-8"))[:16]


def load_state(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


# ----------------------------------------------------------------- review --
def write_review(out_dir: Path, rendered: list[tuple[str, dict]]) -> Path:
    """A local page to compare each new line with the current app audio."""
    rel_public = os.path.relpath(PUBLIC_DIR, out_dir).replace(os.sep, "/")
    rows = "\n".join(
        f"<tr><td><code>{html.escape(i)}</code><br><small>{html.escape(m['character'])}</small></td>"
        f"<td>{html.escape(m['kk'])}</td>"
        f"<td><audio controls preload=none src=\"{html.escape(i)}.wav\"></audio></td>"
        f"<td><audio controls preload=none src=\"{rel_public}/{html.escape(i)}.wav\"></audio></td></tr>"
        for i, m in rendered)
    page = out_dir / "review.html"
    page.write_text(
        "<!doctype html><meta charset=utf-8><title>VoiceStudio review</title>"
        "<style>body{font:15px system-ui;margin:20px}td{border-top:1px solid #ddd;padding:8px;vertical-align:top}"
        "th{text-align:left}</style><h1>VoiceStudio: новые голоса</h1>"
        "<p>Слева новая реплика, справа то, что сейчас в приложении. Если нравится — запустите тот же скрипт с <code>--to-public</code>.</p>"
        f"<table><tr><th>Реплика</th><th>Текст</th><th>VoiceStudio</th><th>Сейчас</th></tr>{rows}</table>",
        encoding="utf-8")
    return page


# ------------------------------------------------------------------- main --
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--make-ref", nargs="?", const="all", metavar="HEROES",
                    help="design reference voices (all missing, or e.g. owl,bear) into tools/voice-ref/")
    ap.add_argument("--characters", default="fox,owl,bear", help="whose lines to render (default: all heroes)")
    ap.add_argument("--only", help="comma-separated audio ids")
    ap.add_argument("--prefix", help="comma-separated id prefixes, e.g. bh_,q_bh_ for one tale")
    ap.add_argument("--mode", choices=["clone", "design"], default="clone")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--force", action="store_true", help="re-render even if nothing changed")
    ap.add_argument("--to-public", action="store_true", help=f"write into {PUBLIC_DIR.relative_to(ROOT)} (the app)")
    ap.add_argument("--out-dir", type=Path, help=f"output folder (default {SAMPLES_DIR.relative_to(ROOT)})")
    ap.add_argument("--no-normalize", action="store_true", help="keep VoiceStudio's own loudness")
    ap.add_argument("--no-lesson-slowdown", action="store_true", help="do not slow letter-lesson lines (per-hero speed still applies)")
    ap.add_argument("--dry-run", action="store_true", help="list what would be rendered; no backend needed")
    args = ap.parse_args()
    overrides = load_voice_overrides()
    if overrides:
        print(f"voices: {VOICES_FILE.relative_to(ROOT)} — " + ", ".join(
            f"{h} «{CHARACTERS[h]['instruct']}» ×{CHARACTERS[h].get('speed', 1.0):.2f}" for h in CHARACTERS if h in overrides))

    if args.make_ref:
        heroes = list(CHARACTERS) if args.make_ref == "all" else [h.strip() for h in args.make_ref.split(",") if h.strip()]
        unknown = [h for h in heroes if h not in CHARACTERS]
        if unknown:
            sys.exit(f"unknown hero(es): {', '.join(unknown)} — known: {', '.join(CHARACTERS)}")
        check_backend()
        for h in heroes:
            out = ref_path(h)
            if out.exists() and not args.force:
                print(f"skip {h}: {out.relative_to(ROOT)} exists (add --force to redesign)")
                continue
            audio, took = request(CHARACTERS[h]["ref_text"], language="en", seed=args.seed, instruct=CHARACTERS[h]["instruct"])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(audio)
            print(f"designed {h}: {out.relative_to(ROOT)} ({duration(audio):.1f}s, {took:.1f}s) — listen to it before rendering")
        return

    heroes = [h.strip() for h in args.characters.split(",") if h.strip()]
    unknown = [h for h in heroes if h not in CHARACTERS]
    if unknown:
        sys.exit(f"unknown hero(es): {', '.join(unknown)} — known: {', '.join(CHARACTERS)}")

    meta = lines_meta()
    wanted = {i: m for i, m in meta.items() if m["character"] in heroes}
    if args.only:
        keep = set(args.only.split(","))
        wanted = {i: m for i, m in wanted.items() if i in keep}
    if args.prefix:
        prefixes = tuple(p.strip() for p in args.prefix.split(",") if p.strip())
        wanted = {i: m for i, m in wanted.items() if i.startswith(prefixes)}

    if args.mode == "clone":
        missing = sorted({m["character"] for m in wanted.values() if not ref_path(m["character"]).exists()})
        if missing and not args.dry_run:
            sys.exit(f"no reference voice for: {', '.join(missing)} — run with --make-ref first")

    out_dir = PUBLIC_DIR if args.to_public else (args.out_dir.resolve() if args.out_dir else SAMPLES_DIR)
    state_path = PUBLIC_STATE if args.to_public else out_dir / ".voicestudio-state.json"
    state = load_state(state_path)
    lesson_tempo = 1.0 if args.no_lesson_slowdown else LESSON_TEMPO
    ffmpeg = find_ffmpeg()
    paced = (lesson_tempo != 1.0 and any(m["lesson"] for m in wanted.values())) or any(CHARACTERS[h].get("speed", 1.0) != 1.0 for h in heroes)
    if not ffmpeg and paced:
        print("note: ffmpeg not found — lesson slowdown and per-hero speed are skipped (install ffmpeg to apply them)")

    plan = []
    for audio_id, m in wanted.items():
        tempo = (lesson_tempo if m["lesson"] else 1.0) * CHARACTERS[m["character"]].get("speed", 1.0)
        tempo = tempo if (ffmpeg and abs(tempo - 1.0) > 1e-3) else None
        ref = ref_path(m["character"]) if args.mode == "clone" else None
        fp = fingerprint(m["kk"], m["character"], args, ref, tempo)
        out = out_dir / f"{audio_id}.wav"
        if not args.force and state.get(audio_id) == fp and out.exists():
            continue
        plan.append((audio_id, m, tempo, ref, fp, out))

    by_hero = {}
    for _, m, *_ in plan:
        by_hero[m["character"]] = by_hero.get(m["character"], 0) + 1
    summary = ", ".join(f"{h} {n}" for h, n in sorted(by_hero.items())) or "nothing"
    print(f"{len(plan)} of {len(wanted)} line(s) to render → {out_dir.relative_to(ROOT) if out_dir.is_relative_to(ROOT) else out_dir} ({summary})")
    if args.dry_run:
        for audio_id, m, tempo, *_ in plan:
            print(f"  {audio_id:<22} {m['character']:<5}{f' ×{tempo:.2f}' if tempo else '      '}  {m['kk'][:60]}")
        return
    if not plan:
        return

    check_backend()
    done = []
    for n, (audio_id, m, tempo, ref, fp, out) in enumerate(plan, 1):
        cfg = CHARACTERS[m["character"]]
        if args.mode == "clone":
            audio, took = request(m["kk"], language="kk", seed=args.seed, ref=ref, ref_text=cfg["ref_text"])
        else:
            audio, took = request(m["kk"], language="kk", seed=args.seed, instruct=cfg["instruct"])
        if tempo:
            audio = slow_down(audio, ffmpeg, tempo)
        if not args.no_normalize:
            audio = level_match(audio)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(audio)
        state[audio_id] = fp
        save_state(state_path, state)  # after every line: an interrupted run resumes where it stopped
        done.append((audio_id, m))
        print(f"[{n}/{len(plan)}] {m['character']:<4} {audio_id} ({duration(audio):.1f}s audio, {took:.1f}s)")

    if args.to_public:
        subprocess.run(["node", str(ROOT / "tools" / "offline-manifest.js")], check=True)
        print("Done. Check the app, then commit public/audio, public/offline-manifest.json "
              f"and {PUBLIC_STATE.relative_to(ROOT)}.")
    else:
        page = write_review(out_dir, [(i, m) for i, m in wanted.items() if (out_dir / f"{i}.wav").exists()])
        print(f"Listen: {page}  — then run the same command with --to-public")


if __name__ == "__main__":
    main()
