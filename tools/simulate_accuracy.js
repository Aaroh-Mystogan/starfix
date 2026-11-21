/* Starfix accuracy simulator.
   Invents realistic night-sky photos with a known location, runs the real solver on them,
   and records how far off each answer was. Output feeds model/train_accuracy_model.py.

   node tools/simulate_accuracy.js --n 10000 --seed 1 --out model/data/trials_1.csv
*/
"use strict";
const path = require("path"), fs = require("fs");
const S = require(path.join(__dirname, "..", "site", "solver.js"));
const { D2R, R2D, norm, cross, dot, add, scale } = S;

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const N = Number(args.n || 2000), OUT = args.out || "model/data/trials.csv";
let seed = Number(args.seed || 1) * 7919 + 13;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const U = (a, b) => a + (b - a) * rnd();
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pick = (items, w) => { let r = rnd() * w.reduce((s, x) => s + x, 0); for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

function refract(v, z, k) { const alt = Math.asin(Math.max(-1, Math.min(1, dot(v, z)))) * R2D; if (alt < -2) return v; const R = S.refractionDeg(alt) * k * D2R; const t = norm(add(z, scale(v, -dot(z, v)))); return norm(add(scale(v, Math.cos(R)), scale(t, Math.sin(R)))); }

const HT = ["sea", "flat", "hills", "mountains", "trees", "buildings"];
const TERRAIN = { sea: null, flat: () => Math.abs(gauss() * 0.08), hills: () => U(0.1, 1.2), mountains: () => U(0.4, 3.5), trees: () => U(0.2, 2.5), buildings: () => U(0.2, 2.5) };
const BUMPS = { sea: 0.005, flat: 0.03, hills: 0.15, mountains: 0.35, trees: 0.3, buildings: 0.25 };
const CAMS = [ // 35 mm-equivalent focal length, aspect, weight
  [13, 4 / 3, 2], [24, 4 / 3, 5], [26, 4 / 3, 5], [14, 3 / 2, 2], [20, 3 / 2, 2], [24, 3 / 2, 2], [35, 3 / 2, 1]
];
const ACC = [2, 30, 120, 600, 3600], ACCW = [4, 2, 2, 2, 1];

function trial() {
  const lat = Math.asin(U(Math.sin(-60 * D2R), Math.sin(72 * D2R))) * R2D, lon = U(-180, 180);
  const utc = new Date(Date.UTC(2020, 0, 1) + U(0, 12 * 365.25) * 86400000);
  const jd = S.jdFromDate(utc), lst = (S.gmstDeg(jd) + lon) * D2R;
  const z = [Math.cos(lat * D2R) * Math.cos(lst), Math.cos(lat * D2R) * Math.sin(lst), Math.sin(lat * D2R)];
  const e = norm(cross([0, 0, 1], z)), n = cross(z, e);
  const dir = (A, h) => add(scale(add(scale(n, Math.cos(A * D2R)), scale(e, Math.sin(A * D2R))), Math.cos(h * D2R)), scale(z, Math.sin(h * D2R)));
  // camera
  const cam0 = pick(CAMS, CAMS.map(c => c[2]));
  const W = 2000, H = Math.round(2000 / cam0[1]), f = cam0[0] * Math.hypot(W, H) / 43.27;
  const vfov = 2 * Math.atan(H / 2 / f) * R2D;
  const useVerticals = rnd() < 0.3;
  const alt = useVerticals ? U(10, 80) : U(0.12, 0.42) * vfov;
  const az = U(0, 360), roll = gauss() * 3 * D2R, k1 = cam0[0] <= 16 ? U(0.02, 0.08) : U(0, 0.04);
  const fwd = dir(az, alt); const right = norm(cross(fwd, z)), down = cross(fwd, right);
  const cam = { R: [add(scale(right, Math.cos(roll)), scale(down, Math.sin(roll))), add(scale(down, Math.cos(roll)), scale(right, -Math.sin(roll))), fwd], f, k1, cx: W / 2, cy: H / 2 };
  // horizon & terrain
  const htype = pick(HT, [15, 25, 25, 15, 12, 8]);
  const trueHeight = Math.exp(U(Math.log(0.5), Math.log(60)));
  const terrain = htype === "sea" ? -S.dipDeg(trueHeight) : TERRAIN[htype]();
  // stars
  const kRef = 1 + 0.08 * gauss(), cNoise = Math.exp(U(Math.log(0.25), Math.log(2.5))), drop = U(0, 0.4), keepN = Math.round(U(6, 40));
  const vis = [];
  for (const [, s] of S.catalogOfDate(jd, [])) {
    const v = refract(s.v, z, kRef); if (dot(v, z) < Math.sin((Math.max(0, terrain) + 0.3) * D2R)) continue;
    const q = S.project(cam, v); if (!q || q[0] < 2 || q[1] < 2 || q[0] > W - 2 || q[1] > H - 2) continue;
    if (rnd() < drop) continue;
    vis.push({ name: s.name, mag: s.mag, x: q[0] + cNoise * gauss(), y: q[1] + cNoise * gauss() });
  }
  vis.sort((a, b) => a.mag - b.mag);
  const ids = vis.slice(0, keepN);
  if (ids.length < 4) return null;
  const horizon = [], verticals = [];
  if (!useVerticals) {
    const nPts = Math.round(U(2, 9)), span = U(0.3, 1), x0 = U(0, 1 - span);
    for (let i = 0; i < nPts; i++) {
      const tx = (x0 + span * (nPts === 1 ? 0.5 : i / (nPts - 1))) * W;
      // find the azimuth whose terrain line lands at this x
      let best = null;
      for (let A = az - 90; A <= az + 90; A += 0.25) { const q = S.project(cam, dir(A, terrain)); if (q && (!best || Math.abs(q[0] - tx) < Math.abs(best.q[0] - tx))) best = { A, q }; }
      if (!best) continue;
      const q = S.project(cam, dir(best.A, terrain + BUMPS[htype] * gauss()));
      if (q && q[1] > 0 && q[1] < H) horizon.push({ x: q[0] + 1.2 * gauss(), y: q[1] + 1.2 * gauss() });
    }
    if (horizon.length < 2) return null;
  } else {
    // vertical edges on buildings, poles, trees: traced by hand (few, 1.2 px) or found automatically (many, 0.7 px),
    // each leaning a little, plus some edges that aren't truly vertical (sloped roofs, railings)
    const auto = rnd() < 0.6, nV = Math.round(auto ? U(3, 20) : U(2, 4)), tap = auto ? 0.7 : 1.2;
    const hfov = 2 * Math.atan(W / 2 / f) * R2D, vfov2 = 2 * Math.atan(H / 2 / f) * R2D;
    for (let i = 0; i < nV; i++) {
      const A = az + U(-0.45, 0.45) * hfov, a0 = alt - U(0.1, 0.5) * vfov2, a1 = a0 + U(2, 0.5 * vfov2);
      const bad = rnd() < 0.15, tilt = bad ? (rnd() < 0.5 ? -1 : 1) * U(2, 10) : 0.3 * gauss(); // tilt from true vertical, degrees
      const lo = Math.max(-5, a0), hi = Math.min(85, a1), shift = Math.tan(tilt * D2R) * (hi - lo);
      const p1 = S.project(cam, dir(A, lo)), p2 = S.project(cam, dir(A + shift / Math.cos(hi * D2R), hi));
      if (p1 && p2 && p1[0] > 0 && p1[0] < W && p1[1] > 0 && p1[1] < H && p2[0] > 0 && p2[0] < W && p2[1] > 0 && p2[1] < H && Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) > 40)
        verticals.push([{ x: p1[0] + tap * gauss(), y: p1[1] + tap * gauss() }, { x: p2[0] + tap * gauss(), y: p2[1] + tap * gauss() }]);
    }
    if (verticals.length < 2) return null;
  }
  const acc = pick(ACC, ACCW), clockErr = gauss() * acc / 2;
  const r = S.solve({ W, H, jd: jd + clockErr / 86400, ids, detections: [], horizon, verticals, horizonType: useVerticals ? undefined : htype, seaHeight: 2, timeSigmaSec: acc, tapSigmaPx: 1.2 });
  if (!r.ok || r.lat == null || r.lon == null || !r.features) return null;
  const errN = (r.lat - lat) * 111.2, errE = ((r.lon - lon + 540) % 360 - 180) * 111.32 * Math.cos(lat * D2R);
  return { ...r.features, calLatKm: r.sigLatKm, calLonKm: r.sigLonKm, errN, errE, trueTerrainDeg: terrain };
}

const cols = ["formalLatKm", "formalLonKm", "nUsed", "rmsArcmin", "fovDeg", "nh", "nv", "hSpan", "hoffSigDeg", "hoffDeg", "lowStarFrac", "camAlt", "lat", "timeSigmaSec", "horizonType", "calLatKm", "calLonKm", "trueTerrainDeg", "errN", "errE"];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const rows = [cols.join(",")]; let made = 0, tried = 0; const t0 = Date.now();
while (made < N) {
  tried++;
  let r = null; try { r = trial(); } catch (_) { r = null; }
  if (!r) continue;
  rows.push(cols.map(c => typeof r[c] === "number" ? +r[c].toFixed(5) : r[c]).join(",")); made++;
  if (made % 1000 === 0) process.stderr.write(`  ${made}/${N} photos simulated (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
}
fs.writeFileSync(OUT, rows.join("\n") + "\n");
process.stderr.write(`Wrote ${made} trials to ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s (${tried - made} skipped: too few stars or cues)\n`);
