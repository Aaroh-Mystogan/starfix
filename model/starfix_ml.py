"""Shared code for Starfix's trained models.

Everything here has an exact JavaScript twin in site/ml.js. If you change a feature,
change both, retrain, and re-export.
"""
from __future__ import annotations

import json
import math

import numpy as np

PATCH = 11          # patch side (pixels) fed to the star detector
HALF = PATCH // 2
WIN = 15            # window used for background and noise estimates
WHALF = WIN // 2
N_FEATURES = PATCH * PATCH + 8

HORIZON_TYPES = ["sea", "flat", "hills", "mountains", "trees", "buildings"]


# ---------------------------------------------------------------- star detector features
def _ring_mask():
    m = np.zeros((WIN, WIN), bool)
    m[0, :] = m[-1, :] = m[:, 0] = m[:, -1] = True
    return m


RING = _ring_mask()


def patch_features(gray: np.ndarray, x: float, y: float) -> np.ndarray | None:
    """Features for the point of light whose centroid is (x, y).

    gray: 2-D float array of 0..255 luminance (0.299 R + 0.587 G + 0.114 B).
    Pixel centres are at integer + 0.5, so the pixel holding the centroid is floor(x), floor(y).
    Returns None when the window would leave the image.
    """
    h, w = gray.shape
    ix, iy = int(math.floor(x)), int(math.floor(y))
    if ix - WHALF < 0 or iy - WHALF < 0 or ix + WHALF >= w or iy + WHALF >= h:
        return None
    win = gray[iy - WHALF: iy + WHALF + 1, ix - WHALF: ix + WHALF + 1].astype(np.float64)
    ring = win[RING]
    bg = float(np.median(ring))
    noise = 1.4826 * float(np.median(np.abs(ring - bg))) + 0.5
    off = WHALF - HALF
    patch = win[off: off + PATCH, off: off + PATCH]
    peak = float(patch.max()) - bg
    if peak <= 1.0:
        peak = 1.0
    norm = np.clip((patch - bg) / peak, -0.5, 1.5)

    c = HALF
    centre = norm[c, c]
    neigh = (norm[c - 1: c + 2, c - 1: c + 2].sum() - centre) / 8.0
    # weighted second moments over the central 7x7
    sub = np.maximum(norm[c - 3: c + 4, c - 3: c + 4], 0.0)
    yy, xx = np.mgrid[-3:4, -3:4]
    s = sub.sum() + 1e-9
    mx, my = (sub * xx).sum() / s, (sub * yy).sum() / s
    ixx = (sub * (xx - mx) ** 2).sum() / s
    iyy = (sub * (yy - my) ** 2).sum() / s
    ixy = (sub * (xx - mx) * (yy - my)).sum() / s
    tr = ixx + iyy
    det = ixx * iyy - ixy * ixy
    disc = math.sqrt(max(0.0, tr * tr / 4 - det))
    l1, l2 = tr / 2 + disc, max(0.0, tr / 2 - disc)
    yy11, xx11 = np.mgrid[-HALF:HALF + 1, -HALF:HALF + 1]
    rr = np.sqrt(xx11 ** 2 + yy11 ** 2)
    ring_out = norm[(rr >= 4) & (rr <= 5.5)].mean()
    sat_box = patch[c - 2: c + 3, c - 2: c + 3]

    extra = np.array([
        math.log10(peak / noise + 1.0),                       # signal to noise
        math.log10(peak + 1.0) / 2.5,                          # absolute brightness
        float((sat_box >= 250).mean()),                        # saturation
        min(5.0, centre / (abs(neigh) + 1e-3)) / 5.0,          # sharpness (hot pixels are spiky)
        min(3.0, math.sqrt(tr)) / 3.0,                         # size
        (l1 - l2) / (l1 + l2 + 1e-9),                          # elongation (trails)
        float((norm > 0.5).mean()),                            # blob area
        float(ring_out),                                       # halo / bloom / edge leakage
    ])
    return np.concatenate([norm.ravel(), extra])


# ---------------------------------------------------------------- tiny MLP inference
def mlp_forward(model: dict, X: np.ndarray) -> np.ndarray:
    """Probability of 'real star' for each row of X, using an exported model dict."""
    Z = (X - np.array(model["mean"])) / np.array(model["std"])
    layers = model["layers"]
    for i, L in enumerate(layers):
        Z = Z @ np.array(L["W"]) + np.array(L["b"])
        if i < len(layers) - 1:
            Z = np.maximum(Z, 0.0)
    return 1.0 / (1.0 + np.exp(-Z[:, 0]))


# ---------------------------------------------------------------- gradient-boosted trees inference
def gbt_predict(model: dict, X: np.ndarray) -> np.ndarray:
    out = np.full(X.shape[0], model["init"], dtype=np.float64)
    lr = model["learning_rate"]
    for t in model["trees"]:
        feat, thr, left, right, val = t["f"], t["t"], t["l"], t["r"], t["v"]
        for i in range(X.shape[0]):
            n = 0
            while left[n] != -1:
                n = left[n] if X[i, feat[n]] <= thr[n] else right[n]
            out[i] += lr * val[n]
    return out


def accuracy_features(f: dict) -> list[float]:
    """Feature vector for the accuracy model from the solver's `features` object."""
    ht = [1.0 if f["horizonType"] == h else 0.0 for h in HORIZON_TYPES]
    return [
        math.log(max(0.3, f["formalLatKm"])), math.log(max(0.3, f["formalLonKm"])),
        f["nUsed"], math.log(max(0.05, f["rmsArcmin"])), f["fovDeg"],
        f["nh"], f["nv"], f["hSpan"], f["hoffSigDeg"], abs(f["hoffDeg"]),
        f["lowStarFrac"], f["camAlt"], abs(f["lat"]), math.log(max(1.0, f["timeSigmaSec"])),
        *ht,
    ]


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
