/* Experiments 2-3: (a) joint sky-ground fit vs assuming the horizon is level; (b) vertical-edge consensus on/off.
   node experiments/exp_ablations.js > experiments/results/ablations.json */
"use strict";
const path = require("path");
const S = require(path.join(__dirname, "..", "site", "solver.js"));
const { D2R, R2D, norm, cross, dot, add, scale } = S;
let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const U = (a, b) => a + (b - a) * rnd(), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
function refr(v, z, k) { const alt = Math.asin(Math.max(-1, Math.min(1, dot(v, z)))) * R2D; if (alt < -2) return v; const R = S.refractionDeg(alt) * k * D2R; const t = norm(add(z, scale(v, -dot(z, v)))); return norm(add(scale(v, Math.cos(R)), scale(t, Math.sin(R)))); }
function base(alt0, alt1) {
  const lat = Math.asin(U(Math.sin(-55 * D2R), Math.sin(65 * D2R))) / D2R, lon = U(-180, 180), utc = new Date(Date.UTC(2024, 0, 1) + U(0, 3 * 365) * 864e5);
  const jd = S.jdFromDate(utc), lst = (S.gmstDeg(jd) + lon) * D2R;
  const z = [Math.cos(lat * D2R) * Math.cos(lst), Math.cos(lat * D2R) * Math.sin(lst), Math.sin(lat * D2R)];
  const e = norm(cross([0, 0, 1], z)), n = cross(z, e);
  const dir = (A, h) => add(scale(add(scale(n, Math.cos(A * D2R)), scale(e, Math.sin(A * D2R))), Math.cos(h * D2R)), scale(z, Math.sin(h * D2R)));
  const W = 2000, H = 1500, f = 26 * Math.hypot(W, H) / 43.27, az = U(0, 360), alt = U(alt0, alt1);
  const fwd = dir(az, alt), right = norm(cross(fwd, z)), down = cross(fwd, right), r = gauss() * 3 * D2R;
  const cam = { R: [add(scale(right, Math.cos(r)), scale(down, Math.sin(r))), add(scale(down, Math.cos(r)), scale(right, -Math.sin(r))), fwd], f, k1: 0.02, cx: W / 2, cy: H / 2 };
  return { lat, lon, jd, z, dir, W, H, f, az, alt, cam };
}
function stars(b, minAlt, kRef) {
  const ids = []; for (const [, s] of S.catalogOfDate(b.jd, [])) { const v = refr(s.v, b.z, kRef); if (dot(v, b.z) < Math.sin(minAlt * D2R)) continue; const q = S.project(b.cam, v); if (!q || q[0] < 2 || q[1] < 2 || q[0] > b.W - 2 || q[1] > b.H - 2) continue; ids.push({ name: s.name, x: q[0] + 0.5 * gauss(), y: q[1] + 0.5 * gauss() }); }
  return ids;
}
const err = (b, r) => S.haversineKm(b.lat, b.lon, r.lat, r.lon);
const out = { terrain: [], verticals: [] };
// (a) terrain-raised horizons
for (const [type, t0, t1, bumps] of [["flat", 0, 0.15, 0.03], ["hills", 0.2, 1.0, 0.1], ["mountains", 0.6, 2.5, 0.25]]) {
  let made = 0;
  while (made < 300) {
    const b = base(8, 16), terrain = U(t0, t1), ids = stars(b, terrain + 0.3, 1 + 0.08 * gauss());
    if (ids.length < 6) continue;
    const horizon = []; for (let A = b.az - 30; A <= b.az + 30; A += 7.5) { const q = S.project(b.cam, b.dir(A, terrain + bumps * gauss())); if (q && q[0] > 5 && q[0] < b.W - 5 && q[1] > 5 && q[1] < b.H - 5) horizon.push({ x: q[0] + 1.2 * gauss(), y: q[1] + 1.2 * gauss() }); }
    if (horizon.length < 4) continue;
    const inp = { W: b.W, H: b.H, jd: b.jd, ids, detections: [], horizon, verticals: [], horizonType: type, timeSigmaSec: 2 };
    const rJ = S.solve(inp), rL = S.solve({ ...inp, assumeLevel: true });
    if (!rJ.ok || rJ.lat == null || !rL.ok || rL.lat == null) continue;
    out.terrain.push({ type, terrain, nStars: ids.length, joint: err(b, rJ), level: err(b, rL), hoff: rJ.joint ? rJ.joint.hoffDeg : null }); made++;
  }
  process.stderr.write(`  terrain ${type} done\n`);
}
// (b) vertical edges with a share of non-vertical ones
for (const badShare of [0, 0.15, 0.3]) {
  let made = 0;
  while (made < 300) {
    const b = base(25, 70), ids = stars(b, 3, 1 + 0.08 * gauss());
    if (ids.length < 6) continue;
    const hf = 2 * Math.atan(b.W / 2 / b.f) * R2D, vf = 2 * Math.atan(b.H / 2 / b.f) * R2D, nV = Math.round(U(6, 18)), verticals = []; let nBad = 0;
    for (let i = 0; i < nV; i++) {
      const A = b.az + U(-0.45, 0.45) * hf, a0 = b.alt - U(0.15, 0.5) * vf, a1 = a0 + U(3, 0.4 * vf), bad = rnd() < badShare, tilt = bad ? (rnd() < 0.5 ? -1 : 1) * U(2, 10) : 0.3 * gauss(); // tilt of the edge from true vertical, degrees
      const lo = Math.max(-5, a0), hi = Math.min(85, a1), shift = Math.tan(tilt * D2R) * (hi - lo); // sideways offset of the top, degrees of arc
      const p1 = S.project(b.cam, b.dir(A, lo)), p2 = S.project(b.cam, b.dir(A + shift / Math.cos(hi * D2R), hi));
      if (p1 && p2 && [p1, p2].every(p => p[0] > 0 && p[0] < b.W && p[1] > 0 && p[1] < b.H) && Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) > 40) { verticals.push([{ x: p1[0] + 0.7 * gauss(), y: p1[1] + 0.7 * gauss() }, { x: p2[0] + 0.7 * gauss(), y: p2[1] + 0.7 * gauss() }]); if (bad) nBad++; }
    }
    if (verticals.length < 4) continue;
    const inp = { W: b.W, H: b.H, jd: b.jd, ids, detections: [], horizon: [], verticals, timeSigmaSec: 2 };
    const rC = S.solve(inp), rN = S.solve({ ...inp, noConsensus: true });
    if (!rC.ok || rC.lat == null || !rN.ok || rN.lat == null) continue;
    out.verticals.push({ badShare, nV: verticals.length, nBad, consensus: err(b, rC), plain: err(b, rN), camAlt: b.alt }); made++;
  }
  process.stderr.write(`  verticals ${badShare} done\n`);
}
console.log(JSON.stringify(out));
