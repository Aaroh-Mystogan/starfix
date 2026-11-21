"""Train Starfix's accuracy model: how far off is this fix likely to be?

The solver reports a formal uncertainty from its own maths, but real photos have errors
the maths can't fully see: terrain on the horizon, a hazy edge, a wrong clock, bent
starlight. tools/simulate_accuracy.js invents tens of thousands of realistic photos with a
known location, runs the real solver on each and records the actual error. This script
learns, from the solver's own diagnostics, how big the error really tends to be, separately
for north-south and east-west, and exports two gradient-boosted tree models to
site/models/accuracy_model.json for the website.

    node tools/simulate_accuracy.js --n 40000 --out model/data/accuracy_trials.csv   # ~1-2 min
    python model/train_accuracy_model.py                                              # ~1-2 min
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import time

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split

from starfix_ml import accuracy_features, gbt_predict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURE_NAMES = ["log formal N-S km", "log formal E-W km", "stars used", "log fit error", "field of view",
                 "horizon points", "vertical edges", "horizon span", "terrain sigma", "|terrain height|",
                 "low-star share", "camera altitude", "|latitude|", "log clock sigma",
                 "sea", "flat", "hills", "mountains", "trees", "buildings"]
EULER = 0.635  # E[log|Z|] = log(sigma) - 0.635 for a normal error Z
OFFSET = 0.3   # km, keeps log() finite for tiny errors


def load(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    feats, eN, eE, base = [], [], [], []
    for r in rows:
        f = {k: (v if k == "horizonType" else float(v)) for k, v in r.items()}
        feats.append(accuracy_features(f))
        eN.append(f["errN"]); eE.append(f["errE"]); base.append((f["calLatKm"], f["calLonKm"]))
    return np.array(feats), np.array(eN), np.array(eE), np.array(base)


def export_gbt(m: GradientBoostingRegressor):
    trees = []
    for est in m.estimators_[:, 0]:
        t = est.tree_
        trees.append({"f": t.feature.tolist(), "t": np.round(t.threshold, 9).tolist(),
                      "l": t.children_left.tolist(), "r": t.children_right.tolist(),
                      "v": np.round(t.value[:, 0, 0], 6).tolist()})
    return {"kind": "gbt", "init": float(m.init_.constant_.ravel()[0]), "learning_rate": m.learning_rate, "trees": trees}


def coverage(err, sig, k=2.0):
    return float(np.mean(np.abs(err) <= k * sig))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(ROOT, "model", "data", "accuracy_trials.csv"))
    ap.add_argument("--trees", type=int, default=400)
    ap.add_argument("--target", type=float, default=0.93, help="share of fixes that should fall inside 2 sigma")
    args = ap.parse_args()
    t0 = time.time()
    X, eN, eE, base = load(args.data)
    print(f"Loaded {len(X)} simulated photos with {X.shape[1]} features each")
    idx = np.arange(len(X))
    tr, te = train_test_split(idx, test_size=0.2, random_state=1)
    tr, va = train_test_split(tr, test_size=0.15, random_state=2)

    out = {"kind": "accuracy", "version": 1, "features": FEATURE_NAMES, "euler": EULER}
    lines = [f"Accuracy model — trained on {len(tr)} simulated photos, calibrated on {len(va)}, tested on {len(te)}", ""]
    for axis, err, bcol in (("north_south", eN, 0), ("east_west", eE, 1)):
        y = np.log(np.abs(err) + OFFSET)
        m = GradientBoostingRegressor(n_estimators=args.trees, max_depth=3, learning_rate=0.05, subsample=0.8,
                                      min_samples_leaf=40, loss="huber", alpha=0.9, random_state=3)
        m.fit(X[tr], y[tr])
        exp = export_gbt(m)
        # check the exported trees reproduce sklearn exactly
        # (scikit-learn compares features as float32, so a value sitting exactly on a split can differ)
        chk = gbt_predict(exp, X[te[:200]].astype(np.float32).astype(np.float64))
        assert np.mean(np.abs(chk - m.predict(X[te[:200]])) < 1e-3) > 0.97, "export mismatch"
        sig = lambda rows: np.exp(m.predict(X[rows]) + EULER)
        # calibrate a single scale so the target share lands inside 2 sigma on held-out data
        s_va = sig(va)
        ratios = np.sort(np.abs(err[va]) / (2 * s_va))
        scale = float(ratios[int(args.target * (len(ratios) - 1))])
        exp["scale"] = scale
        out[axis] = exp
        s_te = sig(te) * scale
        b_te = base[te, bcol]
        rel = np.abs(err[te])
        lines += [f"{axis.replace('_', '-')}:",
                  f"  inside 2 sigma   learned {coverage(err[te], s_te) * 100:5.1f}%   hand-tuned {coverage(err[te], b_te) * 100:5.1f}%",
                  f"  median sigma     learned {np.median(s_te):6.1f} km  hand-tuned {np.median(b_te):6.1f} km",
                  f"  rank correlation between predicted sigma and actual error: learned {spearman(s_te, rel):.3f}   hand-tuned {spearman(b_te, rel):.3f}",
                  ""]
        imp = sorted(zip(FEATURE_NAMES, m.feature_importances_), key=lambda p: -p[1])[:6]
        lines += ["  most informative: " + ", ".join(f"{n} ({v * 100:.0f}%)" for n, v in imp), ""]
    path = os.path.join(ROOT, "site", "models", "accuracy_model.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    err_km = np.hypot(eN[te], eE[te])
    lines += [f"Actual position error across the test photos: median {np.median(err_km):.0f} km, "
              f"best quarter under {np.percentile(err_km, 25):.0f} km, worst tenth over {np.percentile(err_km, 90):.0f} km"]
    report = "\n".join(lines)
    print(report)
    with open(os.path.join(ROOT, "model", "reports", "accuracy_model.txt"), "w", encoding="utf-8") as fh:
        fh.write(report + "\n")
    print(f"\nSaved {path} ({os.path.getsize(path) / 1024:.0f} KB) in {time.time() - t0:.0f}s")


def spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


if __name__ == "__main__":
    main()
