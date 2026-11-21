/* Experiment 4 (part 1): random simulated scenes with a flat horizon, for rendering full photos.
   node experiments/make_scenes.js --n=60 > experiments/results/scenes.json */
"use strict";
const path = require("path"); const S = require(path.join(__dirname, "..", "site", "solver.js"));
const { D2R, norm, cross, dot, add, scale } = S;
const N = Number((process.argv.find(a => a.startsWith("--n=")) || "--n=60").slice(4));
let seed = 99173; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const U = (a, b) => a + (b - a) * rnd(), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const out = [];
while (out.length < N) {
  const lat = Math.asin(U(Math.sin(-50 * D2R), Math.sin(60 * D2R))) / D2R, lon = U(-180, 180), utc = new Date(Date.UTC(2025, 0, 1) + U(0, 700) * 864e5);
  const jd = S.jdFromDate(utc), lst = (S.gmstDeg(jd) + lon) * D2R;
  const z = [Math.cos(lat * D2R) * Math.cos(lst), Math.cos(lat * D2R) * Math.sin(lst), Math.sin(lat * D2R)];
  const e = norm(cross([0, 0, 1], z)), n = cross(z, e);
  const dir = (A, h) => add(scale(add(scale(n, Math.cos(A * D2R)), scale(e, Math.sin(A * D2R))), Math.cos(h * D2R)), scale(z, Math.sin(h * D2R)));
  const W = 2000, H = 1500, f = 26 * Math.hypot(W, H) / 43.27, az = U(0, 360), alt = U(18, 27), roll = gauss() * 2 * D2R;
  const fwd = dir(az, alt), right = norm(cross(fwd, z)), down = cross(fwd, right);
  const cam = { R: [add(scale(right, Math.cos(roll)), scale(down, Math.sin(roll))), add(scale(down, Math.cos(roll)), scale(right, -Math.sin(roll))), fwd], f, k1: 0.02, cx: W / 2, cy: H / 2 };
  const stars = []; for (const [, s] of S.catalogOfDate(jd, [])) { const v = S.refractToward(s.v, z); if (dot(v, z) < Math.sin(1 * D2R)) continue; const q = S.project(cam, v); if (q && q[0] > 0 && q[1] > 0 && q[0] < W && q[1] < H) stars.push({ name: s.name, mag: s.mag, x: q[0], y: q[1] }); }
  if (stars.length < 9) continue;
  const faint = []; for (let i = 0; i < 500; i++) faint.push({ x: rnd() * W, y: rnd() * H, mag: 4 + rnd() * 2.5 });
  const horizon = []; for (let A = az - 70; A <= az + 70; A += 0.25) { const q = S.project(cam, dir(A, 0)); if (q && q[0] >= -5 && q[0] <= W + 5) horizon.push(q); }
  if (horizon.length < 50) continue;
  out.push({ id: out.length, lat, lon, utc: utc.toISOString(), W, H, stars, faint, horizon, hot: Math.round(U(0, 400)), trails: Math.round(U(0, 3)), noise: U(1.5, 4), seed: Math.round(U(1, 1e6)) });
}
console.log(JSON.stringify(out));
