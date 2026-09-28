#!/usr/bin/env python3
"""Turn one KazakhTTS2 speaker folder into a Piper training set.

Input  (KazakhTTS2 layout):  <src>/Audio/<id>.wav  +  <src>/Transcripts/<id>.txt
Output: <out>/wav/<id>.wav   22050 Hz mono, pitch raised like tools/prerender.py
        <out>/metadata.csv   "<id>.wav|<text>" per line (Piper single-speaker format)
        <out>/skipped.tsv    what was dropped and why

The pitch shift is the same filter the app applies at runtime (asetrate + atempo),
so the fine-tuned voice already sounds like the cub and needs no ffmpeg later.
"""
import argparse, random, re, subprocess, sys, wave
from concurrent.futures import ThreadPoolExecutor
from os import cpu_count
from pathlib import Path

SAMPLE_RATE = 22050
MIN_SEC, MAX_SEC = 1.0, 12.0
# Kazakh Cyrillic + punctuation espeak handles. Latin letters and digits would be
# read by espeak in the wrong language, so such lines are skipped, not guessed.
BAD_CHARS = re.compile(r"[0-9A-Za-z|<>\[\]{}@#$%^&*_=+~\\/]")


def duration(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def clean(text: str) -> str:
    text = text.replace("﻿", "").replace("«", '"').replace("»", '"')
    return re.sub(r"\s+", " ", text).strip()


def collect(src: Path, skipped: list) -> list:
    items = []
    for wav in sorted((src / "Audio").glob("*.wav")):
        txt = src / "Transcripts" / f"{wav.stem}.txt"
        if not txt.exists():
            skipped.append((wav.stem, "no transcript"))
            continue
        text = clean(txt.read_text(encoding="utf-8"))
        if not text:
            skipped.append((wav.stem, "empty text"))
            continue
        if BAD_CHARS.search(text):
            skipped.append((wav.stem, "latin/digits/symbols"))
            continue
        try:
            sec = duration(wav)
        except (wave.Error, EOFError) as err:
            skipped.append((wav.stem, f"bad wav: {err}"))
            continue
        if not MIN_SEC <= sec <= MAX_SEC:
            skipped.append((wav.stem, f"duration {sec:.1f}s"))
            continue
        items.append((wav, text, sec))
    return items


def shift(src: Path, dst: Path, pitch: float, ffmpeg: str) -> None:
    af = f"asetrate={SAMPLE_RATE}*{pitch},aresample={SAMPLE_RATE},atempo={1 / pitch}"
    if pitch == 1.0:
        af = f"aresample={SAMPLE_RATE}"
    subprocess.run(
        [ffmpeg, "-nostdin", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-af", af, str(dst)],
        check=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, required=True, help="KazakhTTS2 speaker dir (has Audio/, Transcripts/)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--pitch", type=float, default=1.4)
    ap.add_argument("--max-hours", type=float, default=30)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    args = ap.parse_args()

    if not (args.src / "Audio").is_dir():
        sys.exit(f"{args.src}/Audio not found — run 01_download.sh first")

    skipped: list = []
    items = collect(args.src, skipped)
    total_h = sum(s for _, _, s in items) / 3600
    print(f"usable: {len(items)} utterances, {total_h:.1f} h (skipped {len(skipped)})")

    # Random subset up to the hour budget, so news/books/etc. topics stay mixed.
    random.Random(args.seed).shuffle(items)
    budget = args.max_hours * 3600
    chosen, acc = [], 0.0
    for item in items:
        if acc + item[2] > budget:
            continue
        chosen.append(item)
        acc += item[2]
    chosen.sort(key=lambda it: it[0].stem)
    print(f"chosen: {len(chosen)} utterances, {acc / 3600:.1f} h")

    wav_dir = args.out / "wav"
    wav_dir.mkdir(parents=True, exist_ok=True)
    marker = args.out / "pitch.txt"
    if marker.exists() and marker.read_text().strip() != str(args.pitch):
        sys.exit(f"{wav_dir} was made with pitch {marker.read_text().strip()}; delete {args.out} to rebuild")
    marker.write_text(str(args.pitch))

    todo = [(w, wav_dir / w.name) for w, _, _ in chosen if not (wav_dir / w.name).exists()]
    print(f"pitch-shifting {len(todo)} files (x{args.pitch}), {len(chosen) - len(todo)} already done")
    done = 0
    with ThreadPoolExecutor(max_workers=cpu_count() or 4) as pool:
        for _ in pool.map(lambda p: shift(p[0], p[1], args.pitch, args.ffmpeg), todo):
            done += 1
            if done % 1000 == 0:
                print(f"  {done}/{len(todo)}")

    with open(args.out / "metadata.csv", "w", encoding="utf-8", newline="\n") as f:
        for wav, text, _ in chosen:
            f.write(f"{wav.name}|{text}\n")
    with open(args.out / "skipped.tsv", "w", encoding="utf-8", newline="\n") as f:
        for stem, why in skipped:
            f.write(f"{stem}\t{why}\n")
    print(f"wrote {args.out / 'metadata.csv'}")


if __name__ == "__main__":
    main()
