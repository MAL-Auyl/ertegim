#!/usr/bin/env python3
"""Summarise results/*.jsonl into a comparison table (and results/summary.json).

child / codeswitch: WER and CER of the auto pass and the forced-kk pass,
  compared only on clips every listed system has results for.
story: share of answers the story itself understood — each clip's auto+ru
  passes go through lib/stt-pick.js exactly like server.js, and the answer
  counts only if the picker accepts it confidently with the intended
  count / route / rhyme / encouragement.

Usage: report.py [system1,system2,...] [--hybrid=kk-turbo/large-v3,...]
       (default: every system in results/)
"""
import collections, json, re, statistics, subprocess, sys
from pathlib import Path

import jiwer

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"


def norm(s: str) -> str:
    s = s.lower().replace("ё", "е")
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def load() -> dict:
    data = collections.defaultdict(dict)
    for f in RESULTS.glob("*__*.jsonl"):
        system, set_name = f.stem.split("__")
        rows = {r["id"]: r for r in map(json.loads, open(f, encoding="utf-8"))}
        if rows:
            data[set_name][system] = rows
    return data


def wer_table(per_system: dict) -> list:
    common = set.intersection(*(set(v) for v in per_system.values()))
    rows = []
    for system, res in sorted(per_system.items()):
        items = [res[i] for i in sorted(common)]
        row = {"system": system, "n": len(items)}
        for lang in ("auto", "kk"):
            pairs = [(norm(r["ref"]), norm(r["passes"][lang]["text"])) for r in items]
            pairs = [(a, b) for a, b in pairs if a]
            row[f"wer_{lang}"] = jiwer.wer([a for a, _ in pairs], [b for _, b in pairs])
            row[f"cer_{lang}"] = jiwer.cer([a for a, _ in pairs], [b for _, b in pairs])
            # A few runaway repetition loops dominate corpus WER; the median and
            # the loop rate show the typical clip and the loop problem separately.
            row[f"wer_med_{lang}"] = statistics.median(jiwer.wer(a, b or "∅") for a, b in pairs)
            row[f"loops_{lang}"] = sum(len(b.split()) > 2 * len(a.split()) + 3 for a, b in pairs) / len(pairs)
        row["ms_median"] = statistics.median(p["ms"] for r in items for p in r["passes"].values())
        rows.append(row)
    return rows


def story_table(per_system: dict) -> list:
    common = set.intersection(*(set(v) for v in per_system.values()))
    rows = []
    for system, res in sorted(per_system.items()):
        items = [res[i] for i in sorted(common)]
        payload = [{"node": r["node"], "ctx": r["ctx"], "want": r["want"],
                    "candidates": [r["passes"]["auto"], r["passes"]["ru"]]} for r in items]
        out = json.loads(subprocess.run(["node", str(HERE / "pick.cjs")], input=json.dumps(payload, ensure_ascii=False),
                                        capture_output=True, text=True, encoding="utf-8", check=True).stdout)
        for r, o in zip(items, out):
            r["judged"] = o
        acc = lambda rs: sum(r["judged"]["ok"] for r in rs) / len(rs) if rs else float("nan")
        by = lambda key: {k: acc([r for r in items if key(r) == k]) for k in sorted({key(r) for r in items}, key=str)}
        rows.append({
            "system": system, "n": len(items), "ok": acc(items),
            "clean": acc([r for r in items if not r["noisy"]]), "noisy": acc([r for r in items if r["noisy"]]),
            "by_node": by(lambda r: r["node"]), "by_lang": by(lambda r: r["lang"]),
            "ms_median": statistics.median(p["ms"] for r in items for p in r["passes"].values()),
            "misses": [(r["text"], r["voice"] + (" +noise" if r["noisy"] else ""), r["judged"]["transcript"], r["judged"]["reason"])
                       for r in items if not r["judged"]["ok"]],
        })
    return rows


def add_hybrids(data: dict, combos: list) -> None:
    """Story set only: "A/B" = the auto pass from system A, the ru pass from
    system B — e.g. the Kazakh fine-tune for auto and a stock Whisper for ru,
    since the fine-tune has partly forgotten Russian. Built from existing runs."""
    story = data.get("story", {})
    for combo in combos:
        a, b = combo.split("/")
        if a in story and b in story:
            story[combo] = {i: {**r, "passes": {"auto": r["passes"]["auto"], "ru": story[b][i]["passes"]["ru"]}}
                            for i, r in story[a].items() if i in story[b]}


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--hybrid=")]
    combos = [c for a in sys.argv[1:] if a.startswith("--hybrid=") for c in a.split("=", 1)[1].split(",")]
    only = set(args[0].split(",")) | set(combos) if args else None
    data = load()
    add_hybrids(data, combos)
    summary = {}
    for set_name in ("child", "codeswitch"):
        per = {k: v for k, v in data.get(set_name, {}).items() if (not only or k in only) and "/" not in k}
        if not per:
            continue
        summary[set_name] = rows = wer_table(per)
        print(f"\n== {set_name} (n={rows[0]['n']} common clips)")
        print(f"{'system':16} {'WER auto':>9} {'WER kk':>8} {'median':>7} {'CER auto':>9} {'loops':>6} {'ms/pass':>8}")
        for r in rows:
            print(f"{r['system']:16} {r['wer_auto']:9.1%} {r['wer_kk']:8.1%} {r['wer_med_auto']:7.1%} "
                  f"{r['cer_auto']:9.1%} {r['loops_auto']:6.1%} {r['ms_median']:8.0f}")
    per = {k: v for k, v in data.get("story", {}).items() if not only or k in only}
    if per:
        summary["story"] = rows = story_table(per)
        print(f"\n== story answers understood by lib/stt-pick.js (n={rows[0]['n']})")
        print(f"{'system':16} {'all':>6} {'clean':>6} {'noisy':>6} {'ms/pass':>8}  by node | by lang")
        for r in rows:
            nodes = " ".join(f"{k.replace('q_', '')}={v:.0%}" for k, v in r["by_node"].items())
            langs = " ".join(f"{k}={v:.0%}" for k, v in r["by_lang"].items())
            print(f"{r['system']:16} {r['ok']:6.0%} {r['clean']:6.0%} {r['noisy']:6.0%} {r['ms_median']:8.0f}  {nodes} | {langs}")
    (RESULTS / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
