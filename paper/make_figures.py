"""Figures and statistics for the Starfix paper, built only from saved experiment results.

    python paper/make_figures.py

Reads experiments/results/*.json, model/data/accuracy_trials.csv and site/models/*.json;
writes paper/figures/*.pdf and paper/stats.json.
"""
from __future__ import annotations

import csv
import json
import math
import os
import sys

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "model"))
from starfix_ml import accuracy_features, gbt_predict  # noqa: E402

RES = os.path.join(ROOT, "experiments", "results")
OUT = os.path.join(ROOT, "paper", "figures")
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(20261121)

plt.rcParams.update({
    "font.family": "serif", "font.serif": ["DejaVu Serif"], "mathtext.fontset": "dejavuserif",
    "font.size": 10.5, "axes.titlesize": 10.5, "axes.labelsize": 10.5, "legend.fontsize": 9,
    "xtick.labelsize": 9.5, "ytick.labelsize": 9.5, "axes.spines.top": False, "axes.spines.right": False,
    "axes.linewidth": 0.8, "xtick.major.width": 0.8, "ytick.major.width": 0.8, "axes.grid": True, "axes.grid.axis": "y", "grid.color": "#e6e6e6", "grid.linewidth": 0.6, "axes.axisbelow": True, "savefig.bbox": "tight",
    "savefig.pad_inches": 0.02, "pdf.fonttype": 42,
})
ACCENT, GREY, DARK = "#2166ac", "#9e9e9e", "#333333"
W1, W2 = 3.3, 6.5  # single column, full width (inches)
stats_out: dict = {}


def boot_median_ci(x, n=4000):
    x = np.asarray(x)
    meds = np.median(RNG.choice(x, (n, len(x)), replace=True), axis=1)
    return float(np.median(x)), float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5))


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, max(0.0, c - h), min(1.0, c + h)


# ------------------------------------------------------------------ 1. ablations
abl = json.load(open(os.path.join(RES, "ablations.json")))
fig, axes = plt.subplots(1, 2, figsize=(W2, 3.0), sharey=False)
panels = [
    ("terrain", "type", ["flat", "hills", "mountains"], ["Flat", "Hills", "Mountains"], "joint", "level",
     "(a) Joint fit vs. level-horizon assumption", "Joint sky–ground fit", "Horizon assumed level"),
    ("verticals", "badShare", [0, 0.15, 0.3], ["0%", "15%", "30%"], "consensus", "plain",
     "(b) Edge consensus vs. all edges", "With consensus", "All edges, no consensus"),
]
stats_out["ablations"] = {}
for ax, (key, gcol, groups, glabels, a, b, title, la, lb) in zip(axes, panels):
    rows = abl[key]
    xs = np.arange(len(groups)); w = 0.36
    for j, (col, lab, colr) in enumerate([(a, la, ACCENT), (b, lb, GREY)]):
        meds, lo, hi = [], [], []
        for gval in groups:
            v = [r[col] for r in rows if r[gcol] == gval]
            m, l, h = boot_median_ci(v); meds.append(m); lo.append(m - l); hi.append(h - m)
        bars = ax.bar(xs + (j - 0.5) * w, meds, w, color=colr, label=lab, yerr=[lo, hi], capsize=3, error_kw={"elinewidth": 1.0, "capthick": 1.0, "ecolor": "#222222"}, edgecolor="white", linewidth=0.5)
        for x0, m, hh in zip(xs + (j - 0.5) * w, meds, hi):
            ax.text(x0, m + hh + 4,f"{m:.0f}", ha="center", va="bottom", fontsize=8.5, color=DARK, fontweight="bold")
    for gval, gl in zip(groups, glabels):
        va = np.array([r[a] for r in rows if r[gcol] == gval]); vb = np.array([r[b] for r in rows if r[gcol] == gval])
        p = float(stats.wilcoxon(va, vb).pvalue) if np.any(va != vb) else 1.0
        stats_out["ablations"][f"{key}:{gl}"] = {"n": int(len(va)), "median_with": boot_median_ci(va), "median_without": boot_median_ci(vb),
                                                  "share_better": float(np.mean(va < vb)), "wilcoxon_p": p,
                                                  "p90_with": float(np.percentile(va, 90)), "p90_without": float(np.percentile(vb, 90))}
    ax.set_xticks(xs); ax.set_xticklabels(glabels); ax.set_title(title, loc="left")
    ax.set_ylabel("Median position error (km)")
    ax.legend(frameon=False, loc="upper left")
axes[0].set_xlabel("Terrain raising the visible horizon"); axes[1].set_xlabel("Share of edges that are not vertical")
fig.tight_layout(w_pad=2.5)
fig.savefig(os.path.join(OUT, "fig_ablations.pdf")); plt.close(fig)

# ------------------------------------------------------------------ 2. error by source of the vertical (CDF)
rows = list(csv.DictReader(open(os.path.join(ROOT, "model", "data", "accuracy_trials.csv"), encoding="utf-8")))
for r in rows:
    r["err"] = math.hypot(float(r["errN"]), float(r["errE"])); r["t"] = float(r["timeSigmaSec"])
order = [("sea", "Sea horizon"), ("flat", "Flat-land horizon"), ("none", "Vertical edges, no horizon"), ("hills", "Hills"),
         ("buildings", "Rooflines"), ("trees", "Treeline"), ("mountains", "Mountains")]
fig, ax = plt.subplots(figsize=(W2 * 0.68, 4.1))
shades = {"sea": "#08306b", "flat": "#2171b5", "none": "#d6604d", "hills": "#6baed6", "buildings": "#9e9e9e", "trees": "#bdbdbd", "mountains": "#525252"}
stats_out["by_source"] = {}
for key, lab in order:
    e = np.sort([r["err"] for r in rows if r["horizonType"] == key and r["t"] == 2])
    ax.plot(e, np.arange(1, len(e) + 1) / len(e), lw=2.4 if key == "none" else 1.5, color=shades[key], label=f"{lab} (n={len(e):,})",
            ls="-" if key in ("sea", "flat", "none") else "--")
    m, l, h = boot_median_ci(e)
    stats_out["by_source"][key] = {"n": int(len(e)), "median": m, "ci": [l, h], "q25": float(np.percentile(e, 25)), "q75": float(np.percentile(e, 75)), "p90": float(np.percentile(e, 90))}
ax.set_xscale("log"); ax.set_xlim(1, 3000); ax.set_ylim(0, 1)
ax.axhline(0.5, color="#dddddd", lw=0.6, zorder=0)
ax.set_xlabel("Position error (km, log scale)"); ax.set_ylabel("Cumulative share of photographs")
ax.grid(True, which="major", axis="both", color="#eeeeee"); ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.45, -0.2), ncol=2, fontsize=8.5, handlelength=2.2)
fig.savefig(os.path.join(OUT, "fig_error_cdf.pdf")); plt.close(fig)
stats_out["by_clock"] = {}
for t in [2, 30, 120, 600, 3600]:
    e = [r["err"] for r in rows if r["t"] == t]; m, l, h = boot_median_ci(e)
    stats_out["by_clock"][str(t)] = {"n": len(e), "median": m, "ci": [l, h], "p90": float(np.percentile(e, 90))}

# ------------------------------------------------------------------ 3. recognition vs catalogue stars in frame
rec = json.load(open(os.path.join(RES, "recognition.json")))
bins = [(0, 5), (6, 8), (9, 12), (13, 19), (20, 999)]; labels = ["≤5", "6–8", "9–12", "13–19", "≥20"]
fig, ax = plt.subplots(figsize=(W1 * 1.15, 2.8))
ps, los, his, ns = [], [], [], []
for lo, hi in bins:
    s = [x for x in rec if lo <= x["nCat"] <= hi]; k = sum(x["ok"] for x in s)
    p, l, h = wilson(k, len(s)); ps.append(p * 100); los.append((p - l) * 100); his.append((h - p) * 100); ns.append(len(s))
ax.bar(range(len(bins)), ps, 0.6, color=[GREY, GREY, ACCENT, ACCENT, ACCENT], yerr=[los, his], capsize=3, error_kw={"elinewidth": 1.0, "ecolor": "#222222"})
for i, (p, n) in enumerate(zip(ps, ns)):
    ax.text(i, min(p + his[i], 100) + 3, f"{p:.0f}%", ha="center", fontsize=8.5, fontweight="bold")
    ax.text(i, -16, f"n={n}", ha="center", fontsize=8, color="#555555")
ax.set_xticks(range(len(bins))); ax.set_xticklabels(labels); ax.set_ylim(0, 112)
ax.set_xlabel("Catalogue stars in the frame", labelpad=10); ax.set_ylabel("Sky recognised (%)")
fig.savefig(os.path.join(OUT, "fig_recognition.pdf")); plt.close(fig)
stats_out["recognition"] = {}
for lens in dict.fromkeys(x["lens"] for x in rec):
    for ex in (True, False):
        s = [x for x in rec if x["lens"] == lens and x["exif"] == ex]; k = sum(x["ok"] for x in s)
        p, l, h = wilson(k, len(s))
        stats_out["recognition"][f"{lens}|{ex}"] = {"n": len(s), "rate": p, "ci": [l, h], "median_cat": float(np.median([x["nCat"] for x in s])),
                                                    "median_s": float(np.median([x["ms"] for x in s]) / 1000)}
ok = [x for x in rec if x["ok"]]
stats_out["recognition_ids"] = {"total": int(sum(x["right"] + x["wrong"] for x in ok)), "wrong": int(sum(x["wrong"] for x in ok)), "trials": len(rec), "recognised": len(ok),
                                "median_f_err_pct": float(np.median([x["fErr"] for x in ok]) * 100)}

# ------------------------------------------------------------------ 4. calibration of the learned uncertainty
acc = json.load(open(os.path.join(ROOT, "site", "models", "accuracy_model.json")))
X = np.array([accuracy_features({k: (v if k == "horizonType" else float(v)) for k, v in r.items() if k not in ("err", "t")}) for r in rows])
eN = np.array([float(r["errN"]) for r in rows]); eE = np.array([float(r["errE"]) for r in rows])
cal = np.array([[float(r["calLatKm"]), float(r["calLonKm"])] for r in rows])
from sklearn.model_selection import train_test_split  # noqa: E402
idx = np.arange(len(X)); tr, te = train_test_split(idx, test_size=0.2, random_state=1)
sub = te  # held-out photographs, identical split to train_accuracy_model.py
Xs = X[sub].astype(np.float32).astype(np.float64)
sN = np.exp(gbt_predict(acc["north_south"], Xs) + acc["euler"]) * acc["north_south"]["scale"]
sE = np.exp(gbt_predict(acc["east_west"], Xs) + acc["euler"]) * acc["east_west"]["scale"]
ks = np.linspace(0.25, 3.0, 23)
fig, ax = plt.subplots(figsize=(W1 * 1.25, 3.0))
ax.plot(ks, [100 * (2 * stats.norm.cdf(k) - 1) for k in ks], color="#bbbbbb", lw=1.5, ls=":", label="Ideal (Gaussian)")
for err, s_l, s_h, lab, ls in [(eN[sub], sN, cal[sub, 0], "N–S", "-"), (eE[sub], sE, cal[sub, 1], "E–W", "--")]:
    ax.plot(ks, [100 * np.mean(np.abs(err) <= k * s_l) for k in ks], color=ACCENT, ls=ls, lw=2.0, label=f"Learned, {lab}")
    ax.plot(ks, [100 * np.mean(np.abs(err) <= k * s_h) for k in ks], color=GREY, ls=ls, lw=1.5, label=f"Formal × factor, {lab}")
ax.axvline(2, color="#dddddd", lw=0.6, zorder=0)
ax.set_xlabel("Interval half-width (multiples of predicted σ)"); ax.set_ylabel("True position inside (%)")
ax.set_ylim(0, 100); ax.grid(True, axis="both", color="#eeeeee"); ax.legend(frameon=True, framealpha=0.92, edgecolor="#dddddd", fontsize=8, loc="lower right")
fig.savefig(os.path.join(OUT, "fig_calibration.pdf")); plt.close(fig)
stats_out["calibration"] = {"n_test": int(len(sub)),
                            "within2_learned": [float(np.mean(np.abs(eN[sub]) <= 2 * sN)), float(np.mean(np.abs(eE[sub]) <= 2 * sE))],
                            "within2_formal": [float(np.mean(np.abs(eN[sub]) <= 2 * cal[sub, 0])), float(np.mean(np.abs(eE[sub]) <= 2 * cal[sub, 1]))],
                            "spearman_learned": [float(stats.spearmanr(sN, np.abs(eN[sub]))[0]), float(stats.spearmanr(sE, np.abs(eE[sub]))[0])],
                            "spearman_formal": [float(stats.spearmanr(cal[sub, 0], np.abs(eN[sub]))[0]), float(stats.spearmanr(cal[sub, 1], np.abs(eE[sub]))[0])]}

# ------------------------------------------------------------------ 5. full pipeline on rendered photos
det = json.load(open(os.path.join(RES, "detector.json")))
stats_out["pipeline"] = {}
for mode in ("on", "off"):
    recd = [x for x in det if x[mode]["recognised"]]; err = [x[mode]["errKm"] for x in recd if x[mode].get("errKm") is not None]
    p, l, h = wilson(len(recd), len(det))
    stats_out["pipeline"][mode] = {"recognised": len(recd), "n": len(det), "ci": [l, h], "fixes": len(err), "median": boot_median_ci(err) if err else None,
                                   "p90": float(np.percentile(err, 90)) if err else None, "wrong_id_photos": sum(1 for x in recd if x[mode].get("wrong", 0) > 0)}

# ------------------------------------------------------------------ 6. the real photograph
rp = json.load(open(os.path.join(RES, "real_photo.json")))
photo = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "site", "test-photos", "champaign_2026-11-12_0101_UTC-6.jpg")
im = Image.open(photo).convert("RGB"); s = rp["W"] / im.width; im = im.resize((rp["W"], rp["H"]))
pad = 90
fig, ax = plt.subplots(figsize=(W2, W2 * (rp["H"] + pad) / rp["W"]))
ax.imshow(np.asarray(im), extent=(0, rp["W"], rp["H"], 0))
ax.set_xlim(0, rp["W"]); ax.set_ylim(rp["H"], -pad); ax.axis("off")
ax.add_patch(plt.Rectangle((0, -pad), rp["W"], pad, color="white", zorder=1))
zx, zy = rp["zenithFitPx"]
for (p1, p2) in [(L[0], L[1]) for L in rp["verticalsKept"]]:
    a, b = (p1, p2) if p1["y"] > p2["y"] else (p2, p1)  # a = lower end
    ax.plot([a["x"], zx], [a["y"], zy], color="#7fff00", lw=0.9, ls=(0, (4, 3)), alpha=0.9, zorder=2)
    ax.plot([a["x"], b["x"]], [a["y"], b["y"]], color="#00e676", lw=3.0, zorder=3, solid_capstyle="round")
for m in rp["matches"]:
    if not m["used"]:
        continue
    ax.add_patch(plt.Circle((m["x"], m["y"]), 22, fill=False, ec="#ffeb3b", lw=1.6, zorder=4))
    if m["mag"] < 2.0:
        ax.text(m["x"] + 28, m["y"] - 20, m["name"], color="#fff59d", fontsize=9, fontweight="bold", zorder=5, bbox=dict(boxstyle="round,pad=0.15", fc="black", ec="none", alpha=0.45))
tx, ty = rp["zenithTruePx"]
ax.plot([zx], [zy], marker="+", ms=16, mew=2.2, color="#d7301f", zorder=6)
ax.plot([tx], [ty], marker="o", ms=10, mfc="none", mew=1.6, color="#252525", zorder=6)
ax.text(zx - 30, zy - 32, "fitted zenith (+) and true zenith (○), 0.5 px apart", ha="right", fontsize=9.5, color=DARK, zorder=6)
fig.savefig(os.path.join(OUT, "fig_realphoto.pdf"), dpi=300); plt.close(fig)

# ------------------------------------------------------------------ 7. example detector patches
sys.path.insert(0, os.path.join(ROOT, "model"))
import train_star_detector as T  # noqa: E402
rng = np.random.default_rng(3)
kinds = ["star", "hot_pixel", "noise", "ground_light", "trail", "edge"]; names = ["Star", "Hot pixel", "Noise spike", "Ground light", "Trail", "Bright edge"]
fig, axes = plt.subplots(len(kinds), 6, figsize=(W1 * 1.15, W1 * 1.2))
for i, k in enumerate(kinds):
    got = 0
    while got < 6:
        img = T.render(k, rng)
        if T.detect_center(img) is None:
            continue
        ax = axes[i, got]; ax.imshow(img, cmap="gray", interpolation="nearest", vmin=np.percentile(img, 2), vmax=img.max()); ax.set_xticks([]); ax.set_yticks([])
        for sp in ax.spines.values():
            sp.set_visible(False)
        got += 1
    axes[i, 0].set_ylabel(names[i], rotation=0, ha="right", va="center", fontsize=9.5)
fig.subplots_adjust(wspace=0.05, hspace=0.05)
fig.savefig(os.path.join(OUT, "fig_patches.pdf"), dpi=220); plt.close(fig)

stats_out["real_photo"] = {k: v for k, v in rp.items() if k not in ("matches", "verticalsFound", "verticalsKept")}
stats_out["real_photo"]["verticalsKept"] = len(rp["verticalsKept"]); stats_out["real_photo"]["verticalsFound"] = len(rp["verticalsFound"])
json.dump(stats_out, open(os.path.join(ROOT, "paper", "stats.json"), "w"), indent=1)
print("figures:", sorted(os.listdir(OUT)))
