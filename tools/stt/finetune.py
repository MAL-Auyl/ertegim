#!/usr/bin/env python3
"""LoRA fine-tune of the Kazakh Whisper turbo on child speech, then merge + CT2 export.

Base:  shyngys879/kazakh-whisper-large-v3-turbo (hf/…, Apache-2.0)
Data:  galammadin-asr/child-asr-kazakh train split (data/child, 140 h, ~86k clips)

Leakage guard: that dataset's test split is a random split — 1692 of its 1694
test videos also appear in train, so a model trained on train and scored on
test would be graded on voices it has already heard. Every video that appears
in eval.py's child eval subset is therefore dropped from training entirely
(--holdout-from), which keeps the eval numbers comparable with the base models.

Output: models/<name>-hf (merged HF model) and models/<name>-ct2 (fp16, for eval.py / server.py)

Usage:
  .venv/Scripts/python finetune.py --name kk-turbo-child --max-hours 60 --epochs 1
"""
import argparse, json, random, re, shutil, subprocess, sys, time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from peft import LoraConfig, get_peft_model
from torch.utils.data import DataLoader, Dataset
from transformers import WhisperForConditionalGeneration, WhisperProcessor, get_linear_schedule_with_warmup

HERE = Path(__file__).resolve().parent
BASE = HERE / "hf" / "shyngys879__kazakh-whisper-large-v3-turbo"
CHILD = HERE / "data" / "child"


def video_of(path: str) -> str:
    return re.sub(r"_speaker_.*", "", Path(path).name)


def holdout_videos(eval_results: Path) -> set:
    return {video_of(json.loads(l)["audio"]) for l in open(eval_results, encoding="utf-8")}


class ChildSet(Dataset):
    def __init__(self, rows, processor):
        self.rows, self.processor = rows, processor

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        audio, sr = sf.read(CHILD / r["audio_local_path"], dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        assert sr == 16000, f"{r['audio_local_path']}: {sr} Hz"
        feats = self.processor.feature_extractor(audio, sampling_rate=16000, return_tensors="np").input_features[0]
        labels = self.processor.tokenizer(r["text"]).input_ids
        return feats, labels


class Collate:
    """Pads labels with -100. The tokenizer prepends <|startoftranscript|>…,
    and the model shifts labels right to build decoder inputs, so the leading
    token is dropped here (standard HF Whisper fine-tuning recipe)."""

    def __call__(self, batch):
        feats = torch.tensor(np.stack([b[0] for b in batch]))
        n = max(len(b[1]) for b in batch)
        labels = torch.full((len(batch), n), -100, dtype=torch.long)
        for i, (_, ids) in enumerate(batch):
            labels[i, :len(ids)] = torch.tensor(ids)
        return feats, labels[:, 1:]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="kk-turbo-child")
    ap.add_argument("--max-hours", type=float, default=60)
    ap.add_argument("--epochs", type=float, default=1)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--rank", type=int, default=32)
    ap.add_argument("--max-sec", type=float, default=20)
    ap.add_argument("--holdout-from", type=Path, default=HERE / "results" / "kk-turbo__child.jsonl")
    args = ap.parse_args()

    held = holdout_videos(args.holdout_from)
    rows = [json.loads(l)["source"] for l in open(CHILD / "train.jsonl", encoding="utf-8")]
    rows = [r for r in rows if video_of(r["audio_local_path"]) not in held
            and 0.5 <= r["duration"] <= args.max_sec and r["text"].strip()
            and (CHILD / r["audio_local_path"]).exists()]
    random.Random(0).shuffle(rows)
    budget, picked, acc = args.max_hours * 3600, [], 0.0
    for r in rows:
        if acc + r["duration"] > budget:
            continue
        picked.append(r)
        acc += r["duration"]
    print(f"held-out videos: {len(held)}; training on {len(picked)} clips, {acc / 3600:.1f} h")

    processor = WhisperProcessor.from_pretrained(BASE, language="kazakh", task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(BASE, torch_dtype=torch.bfloat16).cuda()
    model.config.forced_decoder_ids = None
    model.generation_config.forced_decoder_ids = None
    model.config.use_cache = False
    model.gradient_checkpointing_enable({"use_reentrant": False})
    model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(
        r=args.rank, lora_alpha=2 * args.rank, lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "out_proj", "fc1", "fc2"]))
    model.print_trainable_parameters()

    loader = DataLoader(ChildSet(picked, processor), batch_size=args.batch, shuffle=True, num_workers=4,
                        collate_fn=Collate(), persistent_workers=True)
    steps = int(len(loader) * args.epochs)
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=0.01)
    sched = get_linear_schedule_with_warmup(opt, max(1, steps // 20), steps)

    model.train()
    step, t0, running = 0, time.time(), []
    while step < steps:
        for feats, labels in loader:
            out = model(input_features=feats.cuda().to(torch.bfloat16), labels=labels.cuda())
            out.loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
            running.append(out.loss.item())
            step += 1
            if step % 50 == 0:
                el = time.time() - t0
                print(f"step {step}/{steps} loss {np.mean(running[-50:]):.3f} lr {sched.get_last_lr()[0]:.2e} "
                      f"{el / step:.2f}s/step eta {el / step * (steps - step) / 60:.0f} min", flush=True)
            if step >= steps:
                break

    merged = model.merge_and_unload().to(torch.float16)
    hf_dir, ct2_dir = HERE / "models" / f"{args.name}-hf", HERE / "models" / f"{args.name}-ct2"
    merged.save_pretrained(hf_dir)
    processor.save_pretrained(hf_dir)
    # transformers 5 writes processor_config.json; the CT2 converter (and
    # faster-whisper) want the base model's preprocessor_config.json + tokenizer.json.
    for name in ("preprocessor_config.json", "tokenizer.json"):
        if not (hf_dir / name).exists():
            shutil.copy(BASE / name, hf_dir / name)
    json.dump({"base": BASE.name, "clips": len(picked), "hours": round(acc / 3600, 1), "held_out_videos": len(held),
               **{k: str(v) for k, v in vars(args).items()}}, open(hf_dir / "ertegim_train.json", "w"), indent=1)
    subprocess.run([str(HERE / ".venv" / "Scripts" / "ct2-transformers-converter.exe"), "--model", str(hf_dir),
                    "--output_dir", str(ct2_dir), "--quantization", "float16",
                    "--copy_files", "tokenizer.json", "preprocessor_config.json", "--force"], check=True)
    print("saved", hf_dir, ct2_dir)


if __name__ == "__main__":
    sys.exit(main())
