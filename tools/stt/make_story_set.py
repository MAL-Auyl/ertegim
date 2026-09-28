#!/usr/bin/env python3
"""Build the story-answer eval set: plausible child answers to every question
node, spoken by several synthetic child voices (VoiceStudio/OmniVoice voice
design), each also saved with background noise mixed in.

Synthetic TTS children are NOT real children — this set checks the story's
vocabulary (numbers, left/right, rhymes, kk/ru mixing), the child test set
(data/child) checks real child voices.

Output: data/story/<clip>.wav + data/story/story.jsonl
  {"audio": "...", "text": "...", "lang": "kk", "node": "q_tracks",
   "ctx": {"trackCount": 3}, "want": 1 | "river" | "forest" | "any", "voice": "...", "noisy": false}
"""
import importlib.util, io, json, sys, wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("vs", HERE.parent / "prerender_voicestudio.py")
vs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vs)

OUT = HERE / "data" / "story"
VOICES = {
    "girl_hi": "female, child, high pitch",
    "girl_vhi": "female, child, very high pitch",
    "boy_hi": "male, child, high pitch",
    "boy": "male, child",
}
NOISE_SNR_DB = 10

# (node, ctx, want, lang, text). want: expected count / route; "any" = rhyme/empathy node.
ANSWERS = [
    ("q_tracks", {"trackCount": 2}, 2, "kk", "Екі."),
    ("q_tracks", {"trackCount": 3}, 3, "kk", "Үш із бар!"),
    ("q_tracks", {"trackCount": 3}, 3, "kk", "Бір, екі, үш!"),
    ("q_tracks", {"trackCount": 4}, 4, "kk", "Төрт."),
    ("q_tracks", {"trackCount": 5}, 5, "kk", "Бес із."),
    ("q_tracks", {"trackCount": 2}, 2, "ru", "Два."),
    ("q_tracks", {"trackCount": 3}, 3, "ru", "Три следа!"),
    ("q_tracks", {"trackCount": 4}, 4, "ru", "Четыре."),
    ("q_tracks", {"trackCount": 5}, 5, "ru", "Пять!"),
    ("q_tracks", {"trackCount": 3}, 3, "kk", "Үш, три!"),
    ("q_fork", {}, "river", "kk", "Солға!"),
    ("q_fork", {}, "river", "kk", "Өзенге барайық."),
    ("q_fork", {}, "forest", "kk", "Оңға."),
    ("q_fork", {}, "forest", "kk", "Орманға барамыз!"),
    ("q_fork", {}, "river", "ru", "Налево!"),
    ("q_fork", {}, "river", "ru", "К реке."),
    ("q_fork", {}, "forest", "ru", "Направо."),
    ("q_fork", {}, "forest", "ru", "Пойдём в лес!"),
    ("q_fork", {}, "river", "kk", "Налево, өзенге!"),
    ("q_courage", {}, "any", "kk", "Қорықпа!"),
    ("q_courage", {}, "any", "kk", "Мен сенімен біргемін."),
    ("q_courage", {}, "any", "kk", "Сен батылсың, бәрі жақсы болады."),
    ("q_courage", {}, "any", "ru", "Не бойся, я с тобой!"),
    ("q_courage", {}, "any", "ru", "Ты смелый!"),
    ("q_echo", {"brotherName": "Балық"}, "any", "kk", "Қасық!"),
    ("q_echo", {"brotherName": "Балық"}, "any", "kk", "Мысық."),
    ("q_echo", {"brotherName": "Мысық"}, "any", "kk", "Балық!"),
    ("q_echo", {"brotherName": "Мысық"}, "any", "kk", "Қайық."),
]


def add_noise(wav_bytes: bytes, rng: np.random.Generator) -> bytes:
    with wave.open(io.BytesIO(wav_bytes)) as w:
        params = w.getparams()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    # Brown-ish noise with the DC drift removed — closer to room/fan hum than hiss.
    noise = np.cumsum(rng.standard_normal(len(x))).astype(np.float32)
    noise -= np.convolve(noise, np.ones(256) / 256, mode="same")
    p_sig = np.mean(x ** 2) + 1e-9
    p_noise = np.mean(noise ** 2) + 1e-9
    noise *= np.sqrt(p_sig / (p_noise * 10 ** (NOISE_SNR_DB / 10)))
    y = np.clip(x + noise, -32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setparams(params)
        w.writeframes(y.tobytes())
    return buf.getvalue()


def main() -> None:
    vs.check_backend()
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    rows = []
    for vi, (voice, instruct) in enumerate(VOICES.items()):
        for ai, (node, ctx, want, lang, text) in enumerate(ANSWERS):
            name = f"{node}_{ai:02d}_{voice}"
            clean = OUT / f"{name}.wav"
            if not clean.exists():
                audio, _ = vs.request(text, language=lang, seed=100 * vi + ai, instruct=instruct)
                clean.write_bytes(audio)
                print("rendered", clean.name)
            noisy = OUT / f"{name}_noisy.wav"
            if not noisy.exists():
                noisy.write_bytes(add_noise(clean.read_bytes(), rng))
            for path, is_noisy in ((clean, False), (noisy, True)):
                rows.append({"audio": str(path.relative_to(HERE)).replace("\\", "/"), "text": text, "lang": lang,
                             "node": node, "ctx": ctx, "want": want, "voice": voice, "noisy": is_noisy})
    with open(OUT / "story.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{len(rows)} clips -> {OUT / 'story.jsonl'}")


if __name__ == "__main__":
    sys.exit(main())
