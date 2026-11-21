/* Experiment 1: blind star-pattern recognition on simulated detection lists.
   node experiments/exp_recognition.js --n 400 > experiments/results/recognition.json */
"use strict";
const path = require("path");
const S = require(path.join(__dirname, "..", "site", "solver.js")), P = require(path.join(__dirname, "..", "site", "platesolve.js"));
const { D2R, norm, cross, dot, add, scale } = S;
const N = Number((process.argv.find(a => a.startsWith("--n=")) || "--n=400").slice(4));
let seed = 20261112; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const U = (a, b) => a + (b - a) * rnd(), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const LENSES = [["13 mm (phone ultra-wide)", 13, 4 / 3, 0.05], ["26 mm (phone main)", 26, 4 / 3, 0.02], ["24 mm", 24, 3 / 2, 0.01], ["35 mm", 35, 3 / 2, 0.005], ["50 mm", 50, 3 / 2, 0]];
function scene(lens) {
  const lat = Math.asin(U(Math.sin(-55 * D2R), Math.sin(65 * D2R))) / D2R, lon = U(-180, 180), utc = new Date(Date.UTC(2024, 0, 1) + U(0, 3 * 365) * 864e5);
  const jd = S.jdFromDate(utc), lst = (S.gmstDeg(jd) + lon) * D2R;
  const z = [Math.cos(lat * D2R) * Math.cos(lst), Math.cos(lat * D2R) * Math.sin(lst), Math.sin(lat * D2R)];
  const e = norm(cross([0, 0, 1], z)), n = cross(z, e);
  const dir = (A, h) => add(scale(add(scale(n, Math.cos(A * D2R)), scale(e, Math.sin(A * D2R))), Math.cos(h * D2R)), scale(z, Math.sin(h * D2R)));
  const W = 2000, H = Math.round(2000 / lens[2]), f = lens[1] * Math.hypot(W, H) / 43.27;
  const fwd = dir(U(0, 360), U(25, 75)), right = norm(cross(fwd, z)), down = cross(fwd, right), r = gauss() * 5 * D2R;
  const cam = { R: [add(scale(right, Math.cos(r)), scale(down, Math.sin(r))), add(scale(down, Math.cos(r)), scale(right, -Math.sin(r))), fwd], f, k1: lens[3], cx: W / 2, cy: H / 2 };
  const cat = S.catalogOfDate(jd, []), dets = [], drop = U(0, 0.3);
  for (const [, s] of cat) { const v = S.refractToward(s.v, z); if (dot(v, z) < Math.sin(2 * D2R)) continue; const q = S.project(cam, v); if (!q || q[0] < 3 || q[1] < 3 || q[0] > W - 3 || q[1] > H - 3) continue; if (rnd() < drop) continue; dets.push({ x: q[0] + 0.4 * gauss(), y: q[1] + 0.4 * gauss(), flux: Math.pow(10, -0.4 * (s.mag + 0.3 * gauss())), size: 3, name: s.name }); }
  const nCat = dets.length;
  const nField = Math.round(U(150, 600)); for (let i = 0; i < nField; i++) dets.push({ x: rnd() * W, y: rnd() * H, flux: Math.pow(10, -0.4 * (3.4 + rnd() * 3)), size: 3 });
  const nJunk = Math.round(U(0, 8)); for (let i = 0; i < nJunk; i++) dets.push({ x: rnd() * W, y: rnd() * H, flux: Math.pow(10, -0.4 * (-1 + 3 * rnd())), size: 4 });
  dets.sort((a, b) => b.flux - a.flux);
  return { W, H, f, cat, dets, nCat };
}
(async () => {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const lens = LENSES[i % LENSES.length], exif = (Math.floor(i / LENSES.length) % 2) === 0, sc = scene(lens);
    const t0 = Date.now();
    const r = await P.recognize(sc.dets, sc.W, sc.H, sc.cat, { f35: exif ? lens[1] * (1 + 0.02 * gauss()) : null, timeLimitMs: 30000 });
    let right = 0, wrong = 0;
    if (r.ok) for (const id of r.ids) { const d = sc.dets.find(d => Math.abs(d.x - id.x) < 0.01 && Math.abs(d.y - id.y) < 0.01); if (d && d.name === id.name) right++; else wrong++; }
    rows.push({ lens: lens[0], exif, nCat: sc.nCat, ok: r.ok, right, wrong, confident: !!r.confident, ms: Date.now() - t0, fErr: r.ok ? Math.abs(r.f / sc.f - 1) : null });
    if (i % 50 === 49) process.stderr.write(`  ${i + 1}/${N}\n`);
  }
  console.log(JSON.stringify(rows));
})();
