"""Run the trained star detector on a photo from the command line.

    python model/detect_stars.py path/to/photo.jpg

Finds every point of light, asks the trained model whether each one is a real star, and
saves an annotated copy next to the photo (green circles = stars, red crosses = rejected).
Uses the same features and the same exported model file as the website.
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from starfix_ml import load_json, mlp_forward, patch_features

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def to_gray(path, max_side=2000):
    im = Image.open(path).convert("RGB")
    s = min(1.0, max_side / max(im.size))
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float64)
    return im, 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def find_points(g, max_n=2000):
    """Same peak finder as the website: local maxima well above a local background."""
    bg = ndimage.uniform_filter(g, size=25, mode="nearest")
    gs = ndimage.convolve(g, np.array([[1, 2, 1], [2, 4, 2], [1, 2, 1]]) / 16.0, mode="nearest")  # matched filter
    resid = gs - bg
    sigma = max(0.4, 1.4826 * float(np.median(np.abs(resid[::7, ::7]))))
    thr = max(5 * sigma, 3)
    peaks = (gs == ndimage.maximum_filter(gs, size=5)) & (resid >= thr)
    peaks[:3, :] = peaks[-3:, :] = False; peaks[:, :3] = peaks[:, -3:] = False
    ys, xs = np.nonzero(peaks)
    pts = []
    for y, x in zip(ys, xs):
        v = resid[y, x]
        w = np.maximum(0, resid[y - 3:y + 4, x - 3:x + 4] - 0.15 * v)
        sw = w.sum()
        if sw <= 0:
            continue
        yy, xx = np.mgrid[-3:4, -3:4]
        pts.append((x + (w * xx).sum() / sw + 0.5, y + (w * yy).sum() / sw + 0.5, sw))
    pts.sort(key=lambda p: -p[2])
    out = []
    for p in pts:
        if any(abs(q[0] - p[0]) < 4 and abs(q[1] - p[1]) < 4 for q in out[-200:]):
            continue
        out.append(p)
        if len(out) >= max_n:
            break
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photo")
    ap.add_argument("--model", default=os.path.join(ROOT, "site", "models", "star_detector.json"))
    args = ap.parse_args()
    model = load_json(args.model)
    im, g = to_gray(args.photo)
    pts = find_points(g)
    feats, keep = [], []
    for x, y, _ in pts:
        f = patch_features(g, x, y)
        if f is not None:
            feats.append(f); keep.append((x, y))
    if not feats:
        print("No points of light found."); sys.exit(1)
    p = mlp_forward(model, np.array(feats))
    stars = [(x, y) for (x, y), q in zip(keep, p) if q >= model["threshold"]]
    junk = [(x, y) for (x, y), q in zip(keep, p) if q < model["threshold"]]
    d = ImageDraw.Draw(im)
    for x, y in junk:
        d.line([(x - 5, y - 5), (x + 5, y + 5)], fill=(255, 70, 60), width=2); d.line([(x + 5, y - 5), (x - 5, y + 5)], fill=(255, 70, 60), width=2)
    for x, y in stars:
        d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=(110, 230, 160), width=2)
    base, _ = os.path.splitext(args.photo)
    out = base + "_stars.png"
    im.save(out)
    print(f"{len(pts)} points of light: {len(stars)} stars, {len(junk)} rejected (hot pixels, noise, lights, trails, edges)")
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
