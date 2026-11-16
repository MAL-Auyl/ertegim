#!/usr/bin/env python3
"""Prepares a generated sticker for the site: removes the caption under it,
crops to the sticker and recolours the paper background to the site's cream,
so the picture sits on a cream panel without a visible rectangle.

Usage: python3 tools/sticker.py input.png images/sticker-name.webp [cut_row]

cut_row: when the caption touches the sticker and cannot be found automatically,
give the first pixel row of the caption; everything from there down is dropped.
"""
import sys
import numpy as np
from PIL import Image

CREAM = np.array([246, 231, 200.0])          # --cream in the site CSS
src, dst = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert("RGB")).astype(float)
if len(sys.argv) > 3: a = a[:int(sys.argv[3])]
h, w, _ = a.shape
bg = np.median(np.concatenate([a[:12, :12].reshape(-1, 3), a[:12, -12:].reshape(-1, 3)]), axis=0)

ink = np.abs(a - bg).sum(axis=2) > 150       # clearly printed pixels (the pale die-cut border is not)
rows = ink.sum(axis=1) > 0
blocks, start = [], None                      # runs of printed rows
for y, on in enumerate(rows):
    if on and start is None: start = y
    if not on and start is not None: blocks.append((start, y)); start = None
if start is not None: blocks.append((start, h))
# the caption is a short last run in the bottom third, separated from the sticker by blank rows
caption = blocks[-1] if len(blocks) > 1 and blocks[-1][0] > h * .66 and blocks[-1][1] - blocks[-1][0] < 70 else None
if caption is None and len(sys.argv) < 4: print("warning: no separate caption found, kept full height")
top, bottom = blocks[0][0], (blocks[-2][1] if caption else blocks[-1][1])
cols = np.where(ink[top:bottom].sum(axis=0) > 0)[0]
pad = 16
x0, x1 = max(cols[0] - pad, 0), min(cols[-1] + pad, w)
y0, y1 = max(top - pad, 0), min(bottom + pad, caption[0] - 1 if caption else h)
out = np.clip(a[y0:y1, x0:x1] / bg * CREAM, 0, 255).astype(np.uint8)
Image.fromarray(out).save(dst, quality=88, method=6) if dst.endswith(".webp") else Image.fromarray(out).save(dst, optimize=True)
print(dst, out.shape[1], "x", out.shape[0])
