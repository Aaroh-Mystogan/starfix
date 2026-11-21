"""Experiment 4 (part 2): render the scenes from make_scenes.js as photos with stars, sky glow,
sensor noise, a dark landscape, hot pixels and satellite trails.
    python experiments/render_scenes.py experiments/results/scenes.json experiments/results/photos"""
import json, os, sys
import numpy as np
from PIL import Image
scenes = json.load(open(sys.argv[1])); outdir = sys.argv[2]; os.makedirs(outdir, exist_ok=True)
for d in scenes:
    W, H = d["W"], d["H"]; rng = np.random.default_rng(d["seed"])
    yy = np.arange(H)[:, None]
    img = np.zeros((H, W), np.float32) + 14 + 12 * (yy / H)
    hx = np.array([p[0] for p in d["horizon"]]); hy = np.array([p[1] for p in d["horizon"]]); o = np.argsort(hx)
    hline = np.interp(np.arange(W), hx[o], hy[o])
    def blob(x, y, mag):
        amp = 230 * 10 ** (-0.4 * mag); s = 1.3 + max(0, 1.2 - 0.35 * mag)
        x0, x1 = int(max(0, x - 8)), int(min(W, x + 9)); y0, y1 = int(max(0, y - 8)), int(min(H, y + 9))
        if x1 <= x0 or y1 <= y0: return
        gx, gy = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
        img[y0:y1, x0:x1] += amp * np.exp(-((gx - x + 0.5) ** 2 + (gy - y + 0.5) ** 2) / (2 * s * s))
    for s in d["stars"]: blob(s["x"], s["y"], s["mag"])
    for s in d["faint"]: blob(s["x"], s["y"], s["mag"])
    for _ in range(d["trails"]):
        x0, y0, x1, y1 = rng.uniform(0, W), rng.uniform(0, H * 0.7), rng.uniform(0, W), rng.uniform(0, H * 0.7)
        for t in np.linspace(0, 1, int(np.hypot(x1 - x0, y1 - y0)) * 2):
            x, y = int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t)
            if 1 <= x < W - 1 and 0 <= y < H: img[y, x] += 35; img[y, x - 1] += 14; img[y, x + 1] += 14
    img[yy > hline[None, :]] = 5
    img += rng.normal(0, d["noise"], img.shape)
    for _ in range(d["hot"]):
        x, y = rng.integers(5, W - 5), rng.integers(5, H - 5); a = rng.uniform(60, 230)
        img[y, x] += a; img[y, x + 1] += a * 0.3; img[y + 1, x] += a * 0.2
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGB").save(os.path.join(outdir, f"scene_{d['id']:03d}.jpg"), quality=92)
print(len(scenes), "photos rendered")
