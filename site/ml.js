/* Starfix trained models, browser side. Exact twin of model/starfix_ml.py:
   if you change a feature there, change it here, retrain and re-export. */
(function (root) {
"use strict";
const PATCH = 11, HALF = 5, WIN = 15, WHALF = 7;
const HORIZON_TYPES = ["sea", "flat", "hills", "mountains", "trees", "buildings"];

function median(a) { const s = Float64Array.from(a).sort(); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }

// features for the point of light with centroid (x, y); gray is Float32Array (w*h) of 0..255
function patchFeatures(gray, w, h, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix - WHALF < 0 || iy - WHALF < 0 || ix + WHALF >= w || iy + WHALF >= h) return null;
  const at = (dx, dy) => gray[(iy + dy) * w + ix + dx];
  const ring = [];
  for (let dy = -WHALF; dy <= WHALF; dy++) for (let dx = -WHALF; dx <= WHALF; dx++) if (Math.abs(dx) === WHALF || Math.abs(dy) === WHALF) ring.push(at(dx, dy));
  const bg = median(ring);
  const noise = 1.4826 * median(ring.map(v => Math.abs(v - bg))) + 0.5;
  let pmax = -Infinity; for (let dy = -HALF; dy <= HALF; dy++) for (let dx = -HALF; dx <= HALF; dx++) pmax = Math.max(pmax, at(dx, dy));
  let peak = pmax - bg; if (peak <= 1) peak = 1;
  const norm = new Float64Array(PATCH * PATCH);
  for (let r = 0; r < PATCH; r++) for (let c = 0; c < PATCH; c++) norm[r * PATCH + c] = Math.min(1.5, Math.max(-0.5, (at(c - HALF, r - HALF) - bg) / peak));
  const N = (r, c) => norm[(r + HALF) * PATCH + (c + HALF)]; // r,c relative to centre
  const centre = N(0, 0);
  let nsum = 0; for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) nsum += N(r, c);
  const neigh = (nsum - centre) / 8;
  let s = 1e-9, mx = 0, my = 0;
  for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) { const v = Math.max(N(r, c), 0); s += v; mx += v * c; my += v * r; }
  mx /= s; my /= s;
  let ixx = 0, iyy = 0, ixy = 0;
  for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) { const v = Math.max(N(r, c), 0); ixx += v * (c - mx) ** 2; iyy += v * (r - my) ** 2; ixy += v * (c - mx) * (r - my); }
  ixx /= s; iyy /= s; ixy /= s;
  const tr = ixx + iyy, det = ixx * iyy - ixy * ixy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
  let rs = 0, rn = 0, area = 0, sat = 0;
  for (let r = -HALF; r <= HALF; r++) for (let c = -HALF; c <= HALF; c++) { const d = Math.sqrt(r * r + c * c); if (d >= 4 && d <= 5.5) { rs += N(r, c); rn++; } if (N(r, c) > 0.5) area++; }
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) if (at(c, r) >= 250) sat++;
  const extra = [
    Math.log10(peak / noise + 1), Math.log10(peak + 1) / 2.5, sat / 25,
    Math.min(5, centre / (Math.abs(neigh) + 1e-3)) / 5, Math.min(3, Math.sqrt(tr)) / 3,
    (l1 - l2) / (l1 + l2 + 1e-9), area / (PATCH * PATCH), rs / rn
  ];
  const out = new Float64Array(PATCH * PATCH + 8); out.set(norm); out.set(extra, PATCH * PATCH);
  return out;
}

function mlpForward(model, x) {
  let z = Array.from(x, (v, i) => (v - model.mean[i]) / model.std[i]);
  const L = model.layers;
  for (let li = 0; li < L.length; li++) {
    const W = L[li].W, b = L[li].b, out = b.slice();
    for (let i = 0; i < z.length; i++) { const zi = z[i]; if (zi === 0) continue; const row = W[i]; for (let j = 0; j < out.length; j++) out[j] += zi * row[j]; }
    z = li < L.length - 1 ? out.map(v => v > 0 ? v : 0) : out;
  }
  return 1 / (1 + Math.exp(-z[0]));
}

function gbtPredict(model, x) {
  let out = model.init;
  for (const t of model.trees) { let n = 0; while (t.l[n] !== -1) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n]; out += model.learning_rate * t.v[n]; }
  return out;
}

function accuracyFeatures(f) {
  return [
    Math.log(Math.max(0.3, f.formalLatKm)), Math.log(Math.max(0.3, f.formalLonKm)),
    f.nUsed, Math.log(Math.max(0.05, f.rmsArcmin)), f.fovDeg,
    f.nh, f.nv, f.hSpan, f.hoffSigDeg, Math.abs(f.hoffDeg),
    f.lowStarFrac, f.camAlt, Math.abs(f.lat), Math.log(Math.max(1, f.timeSigmaSec)),
    ...HORIZON_TYPES.map(h => f.horizonType === h ? 1 : 0)
  ];
}

const api = { patchFeatures, mlpForward, gbtPredict, accuracyFeatures, HORIZON_TYPES };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StarfixML = api;
})(typeof window !== "undefined" ? window : globalThis);
