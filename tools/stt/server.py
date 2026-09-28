#!/usr/bin/env python3
"""Local Kazakh STT server with Groq's (OpenAI-compatible) transcription API.

server/server.js talks to it exactly as it talks to Groq: point
STT_BASE_URL=http://127.0.0.1:3910/v1 and nothing else changes — same
multipart fields (file, language, prompt, temperature, response_format) and the
same verbose_json shape, including the real per-segment no_speech_prob and
avg_logprob that lib/stt-pick.js needs (VoiceStudio's endpoint returns 0.0 for
both, which the picker would read as "certain").

Default: shyngys879/kazakh-whisper-large-v3-turbo (CT2 fp16, models/kk-turbo-ct2)
for everything except language=ru, which goes to stock large-v3-turbo
(models/turbo-ct2). See README.md for the numbers behind both choices.

Run:  .venv/Scripts/python server.py [--model DIR] [--ru-model DIR|none] [--tuned] [--port 3910]
"""
import argparse, glob, os, tempfile, threading, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
for d in glob.glob(str(HERE / ".venv" / "Lib" / "site-packages" / "nvidia" / "*" / "bin")):
    os.add_dll_directory(d)
    os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]

import hmac

import uvicorn
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

# Plain decoding scored best on the story-answer set (tools/stt/README.md).
# --tuned switches to eval.py's Local.TUNED (temperature fallback + VAD): fewer
# repetition loops on long child speech, but worse on the story's short answers.
DECODE = dict(beam_size=5, condition_on_previous_text=False, temperature=0)
TUNED = dict(beam_size=5, condition_on_previous_text=False, temperature=[0.0, 0.2, 0.4, 0.6],
             compression_ratio_threshold=2.2, log_prob_threshold=-1.0,
             vad_filter=True, vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 300})

app = FastAPI(title="ertegim-stt")
model: WhisperModel | None = None
# The Kazakh fine-tune has partly forgotten Russian, so the forced-ru pass
# (server.js runs auto + ru) goes to a stock multilingual Whisper when one is
# loaded: kk-turbo for auto + stock turbo for ru scored 88% vs 83% alone.
ru_model: WhisperModel | None = None
model_name = ""
# Two passes (auto + ru) arrive in parallel per child answer; the model runs
# them on separate CTranslate2 workers, this only caps queueing beyond that.
gate = threading.Semaphore(4)
# Set STT_SERVER_TOKEN before exposing the server beyond localhost (tunnel,
# cloud box); clients send it as `Authorization: Bearer …` — the app does via
# STT_API_KEY. Unset = no auth, fine only on 127.0.0.1.
TOKEN = os.environ.get("STT_SERVER_TOKEN", "")


def require_token(authorization: str | None = Header(None)):
    if TOKEN and not hmac.compare_digest(authorization or "", f"Bearer {TOKEN}"):
        raise HTTPException(status_code=401, detail="invalid or missing bearer token")


@app.get("/health")
def health():
    return {"status": "ok", "model": model_name}


@app.get("/v1/models")
def models():
    return {"data": [{"id": model_name, "object": "model"}]}


KAZAKH_LETTERS = set("әғқңөұүһіӘҒҚҢӨҰҮҺІ")


def fix_language(detected: str, text: str) -> str:
    """The Kazakh fine-tune lost Whisper's language ID: Kazakh speech comes back
    tagged bg/zh with correct Cyrillic text. The operator log and the answer
    classifier show this tag, so a Cyrillic transcript tagged as anything but
    kk/ru is relabelled — kk when it has Kazakh-only letters, else ru."""
    if detected in ("kk", "ru"):
        return detected
    letters = [c for c in text if c.isalpha()]
    if not letters or sum("Ѐ" <= c <= "ӿ" for c in letters) / len(letters) < 0.6:
        return detected
    return "kk" if any(c in KAZAKH_LETTERS for c in text) else "ru"


@app.post("/v1/audio/transcriptions", dependencies=[Depends(require_token)])
def transcribe(
    file: UploadFile = File(...),
    model_: str = Form("whisper-1", alias="model"),  # accepted for compatibility, the loaded model is used
    language: str | None = Form(None),
    prompt: str | None = Form(None),
    temperature: float | None = Form(None),  # ignored: DECODE's fallback schedule is the point
    response_format: str = Form("json"),
):
    suffix = Path(file.filename or "clip.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file.file.read())
    t0 = time.perf_counter()
    try:
        engine = ru_model if language == "ru" and ru_model else model
        with gate:
            segments, info = engine.transcribe(tmp.name, language=language or None, initial_prompt=prompt or None, **DECODE)
            segments = list(segments)
    except Exception as err:  # malformed audio etc. → 400 like Groq, not a 500 with a traceback
        raise HTTPException(status_code=400, detail=f"transcription failed: {err}")
    finally:
        os.unlink(tmp.name)
    text = "".join(s.text for s in segments).strip()
    if response_format == "text":
        return text
    body = {"text": text, "language": fix_language(info.language, text), "duration": round(info.duration, 3)}
    if response_format == "verbose_json":
        body["task"] = "transcribe"
        body["segments"] = [{"id": i, "start": s.start, "end": s.end, "text": s.text,
                             "avg_logprob": s.avg_logprob, "no_speech_prob": s.no_speech_prob,
                             "compression_ratio": s.compression_ratio, "temperature": s.temperature}
                            for i, s in enumerate(segments)]
        body["x_ms"] = round((time.perf_counter() - t0) * 1000)
    return body


def load(model_dir: str, ru_model_dir: str | None = None, tuned: bool = False, device: str = "cuda") -> None:
    """Load the models into the module globals. Shared by main() and modal_app.py."""
    global model, ru_model, model_name, DECODE
    if tuned:
        DECODE = TUNED
    compute = "float16" if device == "cuda" else "int8"
    model = WhisperModel(model_dir, device=device, compute_type=compute, num_workers=2)
    model_name = Path(model_dir).name
    if ru_model_dir and ru_model_dir != "none" and Path(ru_model_dir).exists():
        ru_model = WhisperModel(ru_model_dir, device=device, compute_type=compute, num_workers=2)
        model_name += f" + {Path(ru_model_dir).name} (ru)"
    print(f"loaded {model_name} on {device} ({compute}), decoding: {'tuned' if tuned else 'plain'}, "
          f"auth: {'bearer token' if TOKEN else 'none'}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=str(HERE / "models" / "kk-turbo-ct2"))
    ap.add_argument("--ru-model", default=str(HERE / "models" / "turbo-ct2"),
                    help="model for language=ru requests; 'none' to use --model for everything")
    ap.add_argument("--tuned", action="store_true", help="temperature fallback + VAD decoding")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=3910)
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()
    load(args.model, args.ru_model, args.tuned, args.device)
    if not TOKEN and args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"WARNING: listening on {args.host} without STT_SERVER_TOKEN — anyone who can reach it can use the GPU")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
