#!/usr/bin/env python3
"""Run one STT system over the eval sets and save raw results for report.py.

Mirrors the production path in server/server.js so the numbers mean what the
child actually gets: the same ffmpeg preprocessing chain, the same per-question
prompt (lib/stt-hints-core.js), the same verbose_json fields (text,
no_speech_prob, avg_logprob), the same Cyrillic filter, and on the story set
the same auto+ru dual pass that lib/stt-pick.js then chooses from.

Systems:
  groq            Groq whisper-large-v3 (what production uses today; needs GROQ_API_KEY in ../../.env)
  large-v3        faster-whisper large-v3, local GPU
  turbo           faster-whisper large-v3-turbo, local GPU
  kk-turbo        shyngys879/kazakh-whisper-large-v3-turbo (CT2 fp16), local GPU
  <name>=<dir>    any other CT2 model dir (e.g. our own fine-tune)
  <local>+tuned   same model with anti-repetition decoding + VAD (see Local.TUNED)

Usage:
  .venv/Scripts/python eval.py kk-turbo            # all sets
  .venv/Scripts/python eval.py groq --child 100    # fewer child clips (rate limits)
"""
import argparse, csv, glob, json, os, random, subprocess, sys, time, urllib.error, urllib.request, uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RESULTS = HERE / "results"
PREP = HERE / "data" / "_prep"

# server/server.js FILTER_CHAINS[0] — the chain production sends to Groq.
FILTER = "highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11"

LOCAL_MODELS = {
    "large-v3": next(iter(glob.glob(os.path.expandvars(
        r"%LOCALAPPDATA%\OmniVoice\hf_cache\models--Systran--faster-whisper-large-v3\snapshots\*"))), None),
    "turbo": str(HERE / "models" / "turbo-ct2"),
    "kk-turbo": str(HERE / "models" / "kk-turbo-ct2"),
}


def ffmpeg() -> str:
    exe = sorted(glob.glob(str(ROOT / "tools" / ".venv" / "Lib" / "site-packages" / "imageio_ffmpeg" / "binaries" / "ffmpeg*.exe")))
    return exe[0] if exe else "ffmpeg"


def prep(src: Path) -> Path:
    """Preprocess once per clip (same for every system), cached."""
    out = PREP / (str(src.relative_to(HERE)).replace("\\", "__").replace("/", "__").rsplit(".", 1)[0] + ".wav")
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run([ffmpeg(), "-nostdin", "-y", "-loglevel", "error", "-i", str(src), "-af", FILTER,
                            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(out)], capture_output=True)
        if r.returncode != 0:  # production falls back to a raw clip when the chain fails
            subprocess.run([ffmpeg(), "-nostdin", "-y", "-loglevel", "error", "-i", str(src),
                            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(out)], check=True)
    return out


def hints() -> dict:
    """Per-node prompts straight from lib/stt-hints-core.js."""
    # lib/*.js is ESM syntax without "type": "module" (Bun doesn't care, node does),
    # so load it from source as a data: URL module.
    js = ("const src = require('fs').readFileSync('lib/stt-hints-core.js', 'utf8');"
          "import('data:text/javascript,' + encodeURIComponent(src)).then(({ sttHintFor, DEFAULT_HINT }) => {"
          "const o = { default: DEFAULT_HINT };"
          "for (const n of ['q_tracks','q_fork','q_courage']) o[n] = sttHintFor(n);"
          "for (const b of ['Балық','Мысық']) o['q_echo:' + b] = sttHintFor('q_echo', { brotherName: b });"
          "process.stdout.write(JSON.stringify(o)); });")
    r = subprocess.run(["node", "-e", js], cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8")
    return json.loads(r.stdout)


def mostly_cyrillic(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return not letters or sum("Ѐ" <= c <= "ӿ" for c in letters) / len(letters) >= 0.6


def shape(text: str, segments: list, detected, lang: str, ms: float) -> dict:
    """Same fields and fallbacks as groqCall() in server/server.js."""
    raw = (text or "").strip()
    text = raw if mostly_cyrillic(raw) else ""
    nsp = max((float(s.get("no_speech_prob") or 0) for s in segments), default=0 if text else 1)
    lps = [float(s["avg_logprob"]) for s in segments if s.get("avg_logprob") is not None]
    return {"text": text, "raw": raw, "lang": (detected or "auto") if lang == "auto" else lang, "requested": lang,
            "noSpeechProb": nsp, "avgLogprob": sum(lps) / len(lps) if lps else None, "ms": round(ms)}


class Local:
    # "+tuned": Whisper's repetition loops («неге неге неге …» on a one-word child
    # clip) are what blows up WER on short child speech. Temperature fallback
    # re-decodes a segment whose text compresses too well (i.e. repeats), and
    # Silero VAD drops the silence the loops grow out of.
    TUNED = dict(temperature=[0.0, 0.2, 0.4, 0.6], compression_ratio_threshold=2.2, log_prob_threshold=-1.0,
                 vad_filter=True, vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 300})

    def __init__(self, model_dir: str, tuned: bool = False):
        self.opts = self.TUNED if tuned else dict(temperature=0)
        for d in glob.glob(str(HERE / ".venv" / "Lib" / "site-packages" / "nvidia" / "*" / "bin")):
            os.add_dll_directory(d)
            os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]
        from faster_whisper import WhisperModel
        self.model = WhisperModel(model_dir, device="cuda", compute_type="float16")

    def __call__(self, wav: Path, lang: str, prompt: str | None) -> dict:
        t0 = time.perf_counter()
        segs, info = self.model.transcribe(str(wav), language=None if lang == "auto" else lang, initial_prompt=prompt,
                                           beam_size=5, condition_on_previous_text=False, **self.opts)
        segs = [{"text": s.text, "no_speech_prob": s.no_speech_prob, "avg_logprob": s.avg_logprob} for s in segs]
        return shape("".join(s["text"] for s in segs), segs, info.language, lang, (time.perf_counter() - t0) * 1000)


class Groq:
    def __init__(self):
        env = dict(l.split("=", 1) for l in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if "=" in l and not l.startswith("#"))
        self.key = env["GROQ_API_KEY"].strip()
        self.model = env.get("GROQ_STT_MODEL", "whisper-large-v3").strip() or "whisper-large-v3"

    def __call__(self, wav: Path, lang: str, prompt: str | None) -> dict:
        fields = {"model": self.model, "temperature": "0", "response_format": "verbose_json"}
        if lang != "auto":
            fields["language"] = lang
        if prompt:
            fields["prompt"] = prompt
        b = uuid.uuid4().hex
        body = b"".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items())
        body += f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="clip.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
        body += wav.read_bytes() + f"\r\n--{b}--\r\n".encode()
        for attempt in range(8):
            req = urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions", data=body, method="POST",
                                         # Groq's Cloudflare front answers 403 to the default Python-urllib UA.
                                         headers={"Authorization": f"Bearer {self.key}", "User-Agent": "ertegim-stt-eval/1",
                                                  "Content-Type": f"multipart/form-data; boundary={b}"})
            t0 = time.perf_counter()
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    d = json.load(r)
                return shape(d.get("text", ""), d.get("segments") or [], d.get("language"), lang, (time.perf_counter() - t0) * 1000)
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    raise
                wait = float(e.headers.get("retry-after") or 10 * (attempt + 1))
                print(f"  groq 429, waiting {wait:.0f}s")
                time.sleep(wait)
        raise RuntimeError("groq: still rate limited")


def load_sets(n_child: int) -> dict:
    child = [json.loads(l)["source"] for l in open(HERE / "data" / "child" / "test.jsonl", encoding="utf-8")]
    random.Random(1234).shuffle(child)
    sets = {"child": [{"id": Path(c["audio_local_path"]).stem, "audio": HERE / "data" / "child" / c["audio_local_path"], "ref": c["text"]}
                      for c in child[:n_child]]}
    cs_dir = HERE / "hf" / "Tim2190__kazakh-codeswitch-asr"
    sets["codeswitch"] = [{"id": r["audio_id"], "audio": cs_dir / r["file_name"], "ref": r["transcript_normalized_written"]}
                          for r in csv.DictReader(open(cs_dir / "metadata.csv", encoding="utf-8"))]
    story = HERE / "data" / "story" / "story.jsonl"
    sets["story"] = [{**r, "id": Path(r["audio"]).stem, "audio": HERE / r["audio"]}
                     for r in map(json.loads, open(story, encoding="utf-8"))] if story.exists() else []
    return sets


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("system")
    ap.add_argument("--child", type=int, default=300, help="child test clips to use (seeded subsample)")
    ap.add_argument("--sets", default="child,codeswitch,story")
    args = ap.parse_args()

    name, _, path = args.system.partition("=")
    if name == "groq":
        run = Groq()
    else:
        base, tuned = name.removesuffix("+tuned"), name.endswith("+tuned")
        model_dir = path or LOCAL_MODELS.get(base)
        if not model_dir or not Path(model_dir).exists():
            sys.exit(f"no model dir for {base!r}")
        run = Local(model_dir, tuned)
        run(prep(HERE / "hf" / "Tim2190__kazakh-codeswitch-asr" / "audio" / "kzaudio_1.wav"), "auto", None)  # warm-up

    H = hints()
    RESULTS.mkdir(exist_ok=True)
    sets = load_sets(args.child)
    for set_name in args.sets.split(","):
        out = RESULTS / f"{name}__{set_name}.jsonl"
        done = {json.loads(l)["id"] for l in open(out, encoding="utf-8")} if out.exists() else set()
        items = [it for it in sets[set_name] if it["id"] not in done]
        print(f"{name} / {set_name}: {len(items)} to go ({len(done)} cached)")
        with open(out, "a", encoding="utf-8") as f:
            for i, it in enumerate(items):
                wav = prep(it["audio"])
                if set_name == "story":
                    node = it["node"]
                    prompt = H.get(f"{node}:{it['ctx'].get('brotherName')}") if node == "q_echo" else H.get(node, H["default"])
                    passes = {lang: run(wav, lang, prompt) for lang in ("auto", "ru")}
                else:
                    # Open-domain speech: no story prompt; auto (production's first pass) and forced kk.
                    passes = {lang: run(wav, lang, None) for lang in ("auto", "kk")}
                row = {k: v for k, v in it.items() if k != "audio"}
                f.write(json.dumps({**row, "audio": str(it["audio"]), "passes": passes}, ensure_ascii=False) + "\n")
                f.flush()
                if i % 50 == 49:
                    print(f"  {i + 1}/{len(items)}")


if __name__ == "__main__":
    main()
