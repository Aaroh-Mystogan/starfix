"""Train Starfix's star detector: is this point of light a real star?

Real phone and camera night shots are full of things that look like stars to a simple
peak finder: hot pixels, noise spikes, street lights, plane and satellite trails, and the
edges of trees and buildings against a glowing sky. This script renders tens of thousands
of labelled examples of each, measures them with the same features the website uses, and
trains a small neural network to tell real stars apart. It then exports the network to
site/models/star_detector.json, which the website runs in the browser.

    python model/train_star_detector.py            # ~3 minutes on a laptop
    python model/train_star_detector.py --n 60000  # quicker, slightly less accurate
"""
from __future__ import annotations

import argparse
import io
import json
import os
import time

import numpy as np
from PIL import Image
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

from starfix_ml import N_FEATURES, mlp_forward, patch_features

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 21  # rendered patch size
NEG_KINDS = ["hot_pixel", "noise", "ground_light", "trail", "edge"]


def render(kind: str, rng: np.random.Generator) -> np.ndarray:
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    c = S / 2 + rng.uniform(-1.5, 1.5, 2)                 # sub-pixel source position
    bg = rng.uniform(4, 90)
    img = bg + rng.normal(0, 0.25, 2) @ np.array([xx - S / 2, yy - S / 2]).reshape(2, -1)
    img = img.reshape(S, S)
    sn = rng.uniform(1.0, 6.0)                              # sensor noise (grey levels)
    if rng.random() < 0.3:                                  # Milky Way / airglow texture
        tex = rng.normal(0, 1, (5, 5))
        img += np.kron(tex, np.ones((5, 5)))[:S, :S] * rng.uniform(1, 6)
    snr = float(np.exp(rng.uniform(np.log(3), np.log(400))))
    amp = snr * sn

    def psf(cx, cy, fwhm, ratio=1.0, ang=0.0, moffat=False):
        s = fwhm / 2.355
        ca, sa = np.cos(ang), np.sin(ang)
        u = (xx + 0.5 - cx) * ca + (yy + 0.5 - cy) * sa
        v = -(xx + 0.5 - cx) * sa + (yy + 0.5 - cy) * ca
        r2 = (u / (s * ratio)) ** 2 + (v / s) ** 2
        return (1 + r2 / (2 * 2.5)) ** -2.5 if moffat else np.exp(-r2 / 2)

    if kind == "star":
        r = rng.random()
        if r < 0.1:   # defocused star: a soft disc
            rad = rng.uniform(2, 5)
            d = np.hypot(xx + 0.5 - c[0], yy + 0.5 - c[1])
            img += amp * 0.6 * np.clip(rad + 0.5 - d, 0, 1)
        else:
            fwhm = rng.uniform(1.2, 5.5)
            ratio = 1.0 + abs(rng.normal(0, 0.15))          # slight trailing / tracking error
            img += amp * psf(c[0], c[1], fwhm, ratio, rng.uniform(0, np.pi), rng.random() < 0.5)
        if rng.random() < 0.3:                              # neighbouring star
            a = rng.uniform(0, 2 * np.pi); d = rng.uniform(4, 9)
            img += amp * rng.uniform(0.05, 0.6) * psf(c[0] + d * np.cos(a), c[1] + d * np.sin(a), rng.uniform(1.2, 4))
    elif kind == "hot_pixel":
        ix, iy = int(c[0]), int(c[1])
        img[iy, ix] += amp
        spread = rng.uniform(0, 0.35)                        # demosaicing smears it a little
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            img[iy + dy, ix + dx] += amp * spread * rng.uniform(0.3, 1.0)
        if rng.random() < 0.25:
            img[iy + rng.integers(-1, 2), ix + rng.integers(-1, 2)] += amp * rng.uniform(0.3, 1)
    elif kind == "noise":
        img += rng.standard_t(3, (S, S)) * sn * rng.uniform(1.5, 3.5)   # heavy-tailed noise spike
    elif kind == "ground_light":
        fwhm = rng.uniform(4, 12)
        img += min(400, amp * 3) * psf(c[0], c[1], fwhm, 1 + abs(rng.normal(0, 0.3)), rng.uniform(0, np.pi), True)
        img += rng.uniform(5, 40) * psf(c[0], c[1], fwhm * 3)           # flare / glow
    elif kind == "trail":
        ang = rng.uniform(0, np.pi); w = rng.uniform(1.3, 3.0) / 2.355
        dist = -(xx + 0.5 - c[0]) * np.sin(ang) + (yy + 0.5 - c[1]) * np.cos(ang)
        along = (xx + 0.5 - c[0]) * np.cos(ang) + (yy + 0.5 - c[1]) * np.sin(ang)
        line = np.exp(-dist ** 2 / (2 * w * w))
        if rng.random() < 0.4:                               # blinking aircraft light: dashes
            line *= (np.sin(along * rng.uniform(0.4, 1.0)) > 0)
        img += amp * 0.6 * line
    elif kind == "edge":
        ang = rng.uniform(-0.6, 0.6) + (np.pi if rng.random() < 0.5 else 0)
        dist = -(xx + 0.5 - c[0]) * np.sin(ang) + (yy + 0.5 - c[1]) * np.cos(ang)
        step = rng.uniform(15, 80)
        img += step * (1 / (1 + np.exp(dist / rng.uniform(0.4, 1.5))))  # glowing sky above dark ground
        if rng.random() < 0.6:                                         # light leaking through branches
            img += amp * 0.4 * psf(c[0] + rng.normal(0, 1), c[1] + rng.normal(0, 1), rng.uniform(1.5, 4))
        img += rng.normal(0, 1, (S, S)) * sn * 1.5
    img += rng.normal(0, sn, (S, S))
    img = np.clip(img, 0, 255)
    if rng.random() < 0.65:                                  # JPEG compression like a real photo
        buf = io.BytesIO()
        Image.fromarray(img.astype(np.uint8)).save(buf, "JPEG", quality=int(rng.uniform(70, 96)))
        img = np.asarray(Image.open(buf).convert("L"), dtype=np.float64)
    return img


BINOMIAL = np.array([[1, 2, 1], [2, 4, 2], [1, 2, 1]], dtype=np.float64) / 16


def smooth(img: np.ndarray) -> np.ndarray:
    """3x3 binomial blur, the website's matched filter (edges left unsmoothed)."""
    out = img.astype(np.float64).copy()
    acc = np.zeros((img.shape[0] - 2, img.shape[1] - 2))
    for dy in range(3):
        for dx in range(3):
            acc += BINOMIAL[dy, dx] * img[dy: dy + acc.shape[0], dx: dx + acc.shape[1]]
    out[1:-1, 1:-1] = acc
    return out


def detect_center(img: np.ndarray):
    """Mimic the website's peak finder: brightest smoothed pixel near the middle, then a weighted centroid."""
    gs = smooth(img)
    bg = float(np.median(gs)); mad = max(0.4, 1.4826 * float(np.median(np.abs(gs - bg))))
    core = gs[S // 2 - 3: S // 2 + 4, S // 2 - 3: S // 2 + 4]
    k = int(np.argmax(core)); py, px = divmod(k, 7); py += S // 2 - 3; px += S // 2 - 3
    v = gs[py, px] - bg
    if v < max(5 * mad, 3):
        return None
    win = gs[py - 3: py + 4, px - 3: px + 4] - bg
    wgt = np.maximum(0, win - 0.15 * v)
    sw = wgt.sum()
    if sw <= 0:
        return None
    yy, xx = np.mgrid[-3:4, -3:4]
    return px + (wgt * xx).sum() / sw + 0.5, py + (wgt * yy).sum() / sw + 0.5


def make_dataset(n: int, seed: int):
    rng = np.random.default_rng(seed)
    X, y, kinds = [], [], []
    # ground lights are the hardest fakes, so they get a double share of the negatives
    shares = {k: (2 if k == "ground_light" else 1) for k in NEG_KINDS}
    tot = sum(shares.values())
    per = {"star": n // 2, **{k: n // 2 * v // tot for k, v in shares.items()}}
    for kind, count in per.items():
        made = 0
        while made < count:
            img = render(kind, rng)
            ctr = detect_center(img)
            if ctr is None:
                continue
            f = patch_features(img, *ctr)
            if f is None:
                continue
            X.append(f); y.append(1 if kind == "star" else 0); kinds.append(kind); made += 1
    return np.array(X), np.array(y), np.array(kinds)


def export(clf: MLPClassifier, mean, std, path, meta):
    model = {
        "kind": "mlp", "version": 1, "n_features": N_FEATURES,
        "mean": mean.tolist(), "std": std.tolist(),
        "layers": [{"W": np.round(W, 6).tolist(), "b": np.round(b, 6).tolist()} for W, b in zip(clf.coefs_, clf.intercepts_)],
        "threshold": 0.5, "meta": meta,
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(model, fh, separators=(",", ":"))
    return model


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300000, help="number of training examples")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--hidden", type=int, nargs="+", default=[128, 64], help="hidden layer sizes")
    args = ap.parse_args()
    t0 = time.time()
    print(f"Rendering {args.n} labelled points of light...")
    X, y, kinds = make_dataset(args.n, args.seed)
    print(f"  done in {time.time() - t0:.0f}s, {X.shape[1]} features each")
    Xtr, Xte, ytr, yte, ktr, kte = train_test_split(X, y, kinds, test_size=0.2, random_state=args.seed, stratify=kinds)
    mean, std = Xtr.mean(0), Xtr.std(0) + 1e-6
    clf = MLPClassifier(hidden_layer_sizes=tuple(args.hidden), alpha=3e-4, batch_size=256, learning_rate_init=1e-3,
                        max_iter=120, early_stopping=True, n_iter_no_change=10, random_state=args.seed)
    print("Training...")
    clf.fit((Xtr - mean) / std, ytr)
    out = os.path.join(ROOT, "site", "models", "star_detector.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    meta = {"trained_on": int(len(Xtr)), "seed": args.seed, "generator": "train_star_detector.py"}
    model = export(clf, mean, std, out, meta)
    # evaluate with the exported weights (exactly what the website will compute)
    p = mlp_forward(model, Xte)
    pred = (p >= 0.5).astype(int)
    lines = [f"Star detector — held-out test set ({len(yte)} examples)", f"ROC AUC: {roc_auc_score(yte, p):.4f}", "",
             classification_report(yte, pred, target_names=["not a star", "star"], digits=3), "Per kind (share classified correctly):"]
    for k in ["star", *NEG_KINDS]:
        m = kte == k
        acc = (pred[m] == (1 if k == "star" else 0)).mean()
        lines.append(f"  {k:13s} {acc * 100:5.1f}%  (n={m.sum()})")
    report = "\n".join(lines)
    print(report)
    rp = os.path.join(ROOT, "model", "reports", "star_detector.txt")
    os.makedirs(os.path.dirname(rp), exist_ok=True)
    with open(rp, "w", encoding="utf-8") as fh:
        fh.write(report + "\n")
    print(f"\nSaved {out} ({os.path.getsize(out) / 1024:.0f} KB) in {time.time() - t0:.0f}s total")


if __name__ == "__main__":
    main()
