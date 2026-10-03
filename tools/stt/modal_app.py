"""Deploy tools/stt/server.py to Modal (serverless GPU) — free within the Starter
plan's $30/month credits (an L4 is ~$0.80/h of actual use; idle costs nothing).

The same FastAPI app as local, so the app side is identical: point
STT_BASE_URL at the printed URL + "/v1" and STT_API_KEY at the token.

One-time setup (from tools/stt):
  .venv\\Scripts\\pip install modal
  .venv\\Scripts\\modal token new                         # browser login, free account
  .venv\\Scripts\\modal secret create ertegim-stt STT_SERVER_TOKEN=<long random string>
  .venv\\Scripts\\modal volume create ertegim-stt-models
  .venv\\Scripts\\modal volume put ertegim-stt-models models/kk-turbo-ct2 /kk-turbo-ct2
  .venv\\Scripts\\modal volume put ertegim-stt-models models/turbo-ct2 /turbo-ct2

Deploy:
  .venv\\Scripts\\modal deploy modal_app.py                # scales to zero when idle
  set STT_WARM=1 && .venv\\Scripts\\modal deploy modal_app.py   # keep 1 GPU warm (jury day), ~$0.80/h
Cold start after idle is ~10-20 s (container + model load); warm requests are fast.
"""
import os
from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
MODEL = os.environ.get("STT_MODEL", "kk-turbo-ct2")       # folder name inside the volume
RU_MODEL = os.environ.get("STT_RU_MODEL", "turbo-ct2")    # "none" = single model

image = (
    # faster-whisper (CTranslate2 4.x) needs CUDA 12 + cuDNN 9 at runtime.
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.12")
    .pip_install("faster-whisper>=1.1", "ctranslate2>=4.5", "fastapi", "uvicorn", "python-multipart")
    .env({"STT_MODEL": MODEL, "STT_RU_MODEL": RU_MODEL})
    .add_local_file(HERE / "server.py", "/root/server.py")
)
models = modal.Volume.from_name("ertegim-stt-models", create_if_missing=True)
app = modal.App("ertegim-stt")


@app.function(
    image=image,
    gpu="L4",
    volumes={"/models": models},
    secrets=[modal.Secret.from_name("ertegim-stt")],  # provides STT_SERVER_TOKEN
    min_containers=int(os.environ.get("STT_WARM", "0")),
    scaledown_window=300,  # stay up 5 min after the last answer: one story session stays warm
    timeout=600,
)
@modal.concurrent(max_inputs=8)  # auto + ru passes of several children at once
@modal.asgi_app()
def web():
    import sys

    sys.path.insert(0, "/root")
    import server

    if not server.TOKEN:
        raise RuntimeError("STT_SERVER_TOKEN missing — refusing to serve a public GPU endpoint without auth")
    ru = os.environ["STT_RU_MODEL"]
    server.load(f"/models/{os.environ['STT_MODEL']}", None if ru == "none" else f"/models/{ru}")
    return server.app
