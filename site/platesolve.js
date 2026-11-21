/* Starfix pattern recognizer: names stars in a photo with no outside help.
   Triangle-shape index over the catalog + focal-length search + whole-field verification.
   Also: automatic horizon detection and an offline nearest-city lookup. */
(function (root) {
"use strict";
const S = (typeof module !== "undefined" && module.exports) ? require("./solver.js") : root.Starfix;
const { D2R, R2D, dot, camRay, wahba, mulMV, fitCamera, project } = S;

const CON = { And: "Andromeda", Aql: "Aquila", Aqr: "Aquarius", Ara: "Ara", Ari: "Aries", Aur: "Auriga", Boo: "Boötes", CMa: "Canis Major", CMi: "Canis Minor", CVn: "Canes Venatici", Cap: "Capricornus", Car: "Carina", Cas: "Cassiopeia", Cen: "Centaurus", Cep: "Cepheus", Cet: "Cetus", Col: "Columba", CrB: "Corona Borealis", Crv: "Corvus", Cru: "Crux (Southern Cross)", Cyg: "Cygnus", Del: "Delphinus", Dra: "Draco", Eri: "Eridanus", Gem: "Gemini", Gru: "Grus", Her: "Hercules", Hya: "Hydra", Hyi: "Hydrus", Leo: "Leo", Lep: "Lepus", Lib: "Libra", Lup: "Lupus", Lyr: "Lyra", Mus: "Musca", Oph: "Ophiuchus", Ori: "Orion", Pav: "Pavo", Peg: "Pegasus", Per: "Perseus", Phe: "Phoenix", PsA: "Piscis Austrinus", Pup: "Puppis", Sco: "Scorpius", Ser: "Serpens", Sgr: "Sagittarius", Tau: "Taurus", TrA: "Triangulum Australe", Tri: "Triangulum", Tuc: "Tucana", UMa: "Ursa Major", UMi: "Ursa Minor", Vel: "Vela", Vir: "Virgo" };

// ---------- catalog triangle index ----------
const MAX_SIDE = 50 * D2R, MIN_SIDE = 0.7 * D2R, BIN = 0.25 * D2R;
let INDEX = null;
function buildIndex(cat) {
  const stars = [...cat.values()].filter(s => !s.planet);
  const n = stars.length, V = stars.map(s => s.v);
  const A = []; for (let i = 0; i < n; i++) { A.push(new Float64Array(n)); }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = Math.acos(Math.max(-1, Math.min(1, dot(V[i], V[j])))); A[i][j] = A[j][i] = a; }
  const bins = new Map(); let count = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const dij = A[i][j]; if (dij > MAX_SIDE || dij < MIN_SIDE) continue;
    for (let k = j + 1; k < n; k++) {
      const dik = A[i][k], djk = A[j][k];
      if (dik > MAX_SIDE || djk > MAX_SIDE || dik < MIN_SIDE || djk < MIN_SIDE) continue;
      const t = labelled(dij, dik, djk, i, j, k);
      t.sign = Math.sign(det3(V[t.a], V[t.b], V[t.c]));
      const key = Math.floor(t.s2 / BIN); if (!bins.has(key)) bins.set(key, []); bins.get(key).push(t); count++;
    }
  }
  INDEX = { stars, V, bins, count };
  return INDEX;
}
// sides sorted s0<=s1<=s2; vertex a is opposite s0, b opposite s1, c opposite s2
function labelled(dij, dik, djk, i, j, k) {
  const e = [[djk, i], [dik, j], [dij, k]].sort((p, q) => p[0] - q[0]);
  return { s0: e[0][0], s1: e[1][0], s2: e[2][0], a: e[0][1], b: e[1][1], c: e[2][1] };
}
function det3(a, b, c) { return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }

// ---------- chance-coincidence statistics ----------
const LF = [0]; for (let i = 1; i < 1000; i++) LF[i] = LF[i - 1] + Math.log(i);
// -log10 P(X >= k) for X ~ Poisson(lambda): how surprising k chance matches would be
function signif(k, lambda) {
  if (k <= lambda || k <= 0) return 0;
  lambda = Math.max(lambda, 1e-6);
  let lp = -lambda + k * Math.log(lambda) - LF[Math.min(k, 999)];
  // add the tail terms (geometric-ish bound, few terms suffice)
  let term = 0, sum = 1; for (let i = k + 1; i < k + 40; i++) { term += Math.log(lambda / i); sum += Math.exp(term); if (Math.exp(term) < 1e-12) break; }
  lp += Math.log(sum);
  return -lp / Math.LN10;
}

// ---------- recognizer ----------
// dets: [{x,y,flux,size}] sorted bright->faint. Returns { ok, ids:[{name,x,y}], f, matches, score, tried }
async function recognize(dets, W, H, cat, opts = {}) {
  if (!INDEX) buildIndex(cat);
  const { stars, V, bins } = INDEX;
  const diag = Math.hypot(W, H), cx = W / 2, cy = H / 2;
  const below = opts.belowHorizon || (() => false);
  const usable = dets.filter(d => d.size < 40 && !below(d.x, d.y));
  const top = usable.slice(0, opts.nTop || 22);
  const verify = usable.slice(0, 90);
  if (top.length < 4) return { ok: false, reason: "few_points" };
  // spatial grid of verification points
  const cell = 24, gw = Math.ceil(W / cell) + 1, grid = new Map();
  verify.forEach((d, i) => { const k = Math.floor(d.x / cell) + gw * Math.floor(d.y / cell); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const nearest = (x, y, r) => {
    let best = -1, bd = r; const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell), y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) { const l = grid.get(gx + gw * gy); if (!l) continue; for (const i of l) { const d = Math.hypot(verify[i].x - x, verify[i].y - y); if (d < bd) { bd = d; best = i; } } }
    return best;
  };
  // focal lengths to try
  let fList = [];
  if (opts.f35) { const f0 = opts.f35 * diag / 43.27; fList = [1, 0.96, 1.04, 0.92, 1.08].map(k => f0 * k); }
  const fovMin = 12 * D2R, fovMax = 140 * D2R; const fA = diag / (2 * Math.tan(fovMax / 2)), fB = diag / (2 * Math.tan(fovMin / 2));
  const fGrid = []; for (let f = fA; f <= fB; f *= 1.055) if (!fList.some(g => Math.abs(g / f - 1) < 0.02)) fGrid.push(f);
  const fTyp = diag / (2 * Math.tan(37.5 * D2R)); // ~75° diagonal: a phone's main camera
  fGrid.sort((p, q) => Math.abs(Math.log(p / fTyp)) - Math.abs(Math.log(q / fTyp)));
  fList = fList.concat(fGrid);
  const tolLoose = Math.max(7, 0.011 * diag);
  const pOf = tol => Math.min(0.9, verify.length * Math.PI * tol * tol / (W * H));
  const pLoose = pOf(tolLoose);
  const hyps = []; let tried = 0;
  const keepHyp = h => { hyps.push(h); hyps.sort((p, q) => q.score - p.score); if (hyps.length > 12) hyps.pop(); };
  const refine = h => {
    if (h.cand !== undefined) return h.cand;
    let cam = null, matched = h.pairs;
    for (let round = 0; round < 3; round++) {
      const fp = matched.map(([s, q]) => ({ x: verify[q].x, y: verify[q].y, v: V[s] }));
      if (fp.length < 3) break;
      cam = fitCamera(fp, W, H, { init: cam || { R: h.R, f: h.f, k1: 0 } });
      const tight = Math.max(3, Math.min(3 * cam.rmsPx, 0.004 * diag), round === 0 ? 0.005 * diag : 0);
      const used = new Set(), m2 = []; let nIn = 0;
      for (let s = 0; s < V.length; s++) { const q0 = project(cam, V[s]); if (!q0 || q0[0] < 0 || q0[1] < 0 || q0[0] > W || q0[1] > H) continue; nIn++; const q = nearest(q0[0], q0[1], tight); if (q < 0 || used.has(q)) continue; used.add(q); m2.push([s, q]); }
      matched = m2; h.nIn = nIn; h.tight = tight;
    }
    h.cand = (!cam || matched.length < 4) ? null : { cam, matched, score: signif(matched.length - 3, (h.nIn - 3) * pOf(h.tight)), k: matched.length, rms: cam.rmsPx };
    return h.cand;
  };
  const startT = Date.now();
  for (let fi = 0; fi < fList.length; fi++) {
    const f = fList[fi], cam0 = { cx, cy, f, k1: 0 };
    const U = top.map(d => camRay(cam0, d.x, d.y));
    const cosCone = Math.cos(Math.atan(diag / 2 / f) + 2 * D2R);
    const n = top.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const dij = Math.acos(Math.min(1, dot(U[i], U[j]))), dik = Math.acos(Math.min(1, dot(U[i], U[k]))), djk = Math.acos(Math.min(1, dot(U[j], U[k])));
      if (dij > MAX_SIDE || dik > MAX_SIDE || djk > MAX_SIDE || dij < MIN_SIDE || dik < MIN_SIDE || djk < MIN_SIDE) continue;
      const t = labelled(dij, dik, djk, i, j, k);
      const sgn = Math.sign(det3(U[t.a], U[t.b], U[t.c]));
      const tol = s => 0.18 * D2R + 0.035 * s;
      const t2 = tol(t.s2), t1 = tol(t.s1), t0 = tol(t.s0);
      for (let b = Math.floor((t.s2 - t2) / BIN); b <= Math.floor((t.s2 + t2) / BIN); b++) {
        const list = bins.get(b); if (!list) continue;
        for (const c of list) {
          if (Math.abs(c.s2 - t.s2) > t2 || Math.abs(c.s1 - t.s1) > t1 || Math.abs(c.s0 - t.s0) > t0) continue;
          if (c.sign !== sgn) continue;
          tried++;
          const R = wahba([V[c.a], V[c.b], V[c.c]], [U[t.a], U[t.b], U[t.c]]);
          // whole-field verification
          let k = 0, nIn = 0; const pairs = [];
          const used = new Set();
          for (let s = 0; s < V.length; s++) {
            const v = V[s], cz = R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2];
            if (cz < cosCone) continue;
            const x = cx + f * (R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2]) / cz, y = cy + f * (R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2]) / cz;
            if (x < 0 || y < 0 || x > W || y > H) continue;
            nIn++;
            const q = nearest(x, y, tolLoose); if (q < 0 || used.has(q)) continue;
            used.add(q); k++; pairs.push([s, q]);
          }
          if (k < 5) continue;
          const score = signif(k - 3, (nIn - 3) * pLoose);
          if (hyps.length < 12 || score > hyps[hyps.length - 1].score) keepHyp({ score, k, pairs, f, R });
        }
      }
    }
    // early exit: refine the leading few; stop once one is overwhelming
    let strong = false; for (const h of hyps.slice(0, 3)) { const c = refine(h); if (c && c.score >= 25) { strong = true; break; } }
    if (strong) break;
    if (opts.onProgress && fi % 3 === 0) { opts.onProgress(fi / fList.length); await new Promise(r => setTimeout(r, 0)); }
    if (Date.now() - startT > (opts.timeLimitMs || 25000)) break;
  }
  if (!hyps.length) return { ok: false, reason: "no_match", tried };
  // pick the best refined hypothesis; runner-up must be a different solution
  let best = null;
  const same = (A, B) => dot(A.cam.R[2], B.cam.R[2]) > Math.cos(1 * D2R);
  for (const h of hyps) {
    const cand = refine(h); if (!cand) continue;
    if (!best || cand.score > best.score) { if (best && !same(best, cand)) cand.runnerUp = Math.max(best.score, best.runnerUp || 0); else if (best) cand.runnerUp = best.runnerUp || 0; best = cand; }
    else if (!same(best, cand) && (!best.runnerUp || cand.score > best.runnerUp)) best.runnerUp = cand.score;
  }
  if (!best || best.score < 9 || best.k < 5) return { ok: false, reason: "weak", score: best ? best.score : 0, tried };
  const ids = best.matched.map(([s, q]) => ({ name: stars[s].name, con: stars[s].con, mag: stars[s].mag, x: verify[q].x, y: verify[q].y, source: "pattern" }));
  const confident = best.score >= 14 && (!best.runnerUp || best.score >= 2 * best.runnerUp);
  return { ok: true, ids, f: best.cam.f, score: best.score, k: best.k, runnerUp: best.runnerUp || 0, confident, tried, constellations: constellationsOf(ids) };
}
function constellationsOf(ids) {
  const c = new Map(); for (const i of ids) if (i.con) c.set(i.con, (c.get(i.con) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).map(([k]) => CON[k] || k);
}


// ---------- sky mask: where can stars be? ----------
// The night sky is the dark, smooth part of a photo. Lit buildings, trees, roofs and lights are
// brighter and/or textured, and their edges make hundreds of false "stars". Works at 1/4 scale.
function skyMask(g, w, h) {
  const F = 4, w4 = Math.floor(w / F), h4 = Math.floor(h / F), n = w4 * h4;
  // per 4x4 cell: minimum (rejects stars) and high-pass energy (texture)
  const mn = new Float32Array(n), en = new Float32Array(n);
  for (let y = 0; y < h4; y++) for (let x = 0; x < w4; x++) {
    let m = 1e9, s = 0, s2 = 0;
    for (let dy = 0; dy < F; dy++) for (let dx = 0; dx < F; dx++) { const v = g[(y * F + dy) * w + x * F + dx]; if (v < m) m = v; s += v; s2 += v * v; }
    mn[y * w4 + x] = m; en[y * w4 + x] = Math.sqrt(Math.max(0, s2 / 16 - (s / 16) ** 2));
  }
  const box = (a, r) => { // separable box mean on the small grid
    const t = new Float32Array(n), o = new Float32Array(n);
    for (let y = 0; y < h4; y++) { let acc = 0, c = 0; for (let x = -r; x < w4 + r; x++) { if (x + r < w4 && x + r >= 0) { acc += a[y * w4 + x + r]; c++; } if (x - r - 1 >= 0) { acc -= a[y * w4 + x - r - 1]; c--; } if (x >= 0 && x < w4) t[y * w4 + x] = acc / c; } }
    for (let x = 0; x < w4; x++) { let acc = 0, c = 0; for (let y = -r; y < h4 + r; y++) { if (y + r < h4 && y + r >= 0) { acc += t[(y + r) * w4 + x]; c++; } if (y - r - 1 >= 0) { acc -= t[(y - r - 1) * w4 + x]; c--; } if (y >= 0 && y < h4) o[y * w4 + x] = acc / c; } }
    return o;
  };
  const bg = box(mn, 4), tex = box(en, 3);
  const pct = (a, q) => { const s = Float32Array.from(a).sort(); return s[Math.floor(q * (s.length - 1))]; };
  const bLo = pct(bg, 0.3), tLo = pct(tex, 0.3);
  let m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = bg[i] < bLo * 2 + 15 && tex[i] < tLo * 2.5 + 1.5 ? 1 : 0;
  const morph = (a, it, grow) => { let cur = a; for (let k = 0; k < it; k++) { const nx = new Uint8Array(n); for (let y = 0; y < h4; y++) for (let x = 0; x < w4; x++) { let v = cur[y * w4 + x]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; const u = xx < 0 || yy < 0 || xx >= w4 || yy >= h4 ? 0 : cur[yy * w4 + xx]; v = grow ? (v | u) : (v & u); } nx[y * w4 + x] = v; } cur = nx; } return cur; };
  m = morph(morph(m, 1, false), 1, true); // opening
  // keep large components only
  const lab = new Int32Array(n).fill(-1), sizes = []; const q = new Int32Array(n);
  for (let i = 0; i < n; i++) { if (!m[i] || lab[i] >= 0) continue; const id = sizes.length; let head = 0, tail = 0; q[tail++] = i; lab[i] = id; let cnt = 0;
    while (head < tail) { const j = q[head++]; cnt++; const x = j % w4, y = (j / w4) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w4 || yy >= h4) continue; const k = yy * w4 + xx; if (m[k] && lab[k] < 0) { lab[k] = id; q[tail++] = k; } } }
    sizes.push(cnt); }
  const big = sizes.map(s => s > 0.02 * n);
  for (let i = 0; i < n; i++) m[i] = lab[i] >= 0 && big[lab[i]] ? 1 : 0;
  // fill holes (stars and small glints inside the sky)
  const out = new Uint8Array(n); let head = 0, tail = 0;
  for (let x = 0; x < w4; x++) for (const y of [0, h4 - 1]) { const k = y * w4 + x; if (!m[k] && !out[k]) { out[k] = 1; q[tail++] = k; } }
  for (let y = 0; y < h4; y++) for (const x of [0, w4 - 1]) { const k = y * w4 + x; if (!m[k] && !out[k]) { out[k] = 1; q[tail++] = k; } }
  while (head < tail) { const j = q[head++]; const x = j % w4, y = (j / w4) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w4 || yy >= h4) continue; const k = yy * w4 + xx; if (!m[k] && !out[k]) { out[k] = 1; q[tail++] = k; } } }
  for (let i = 0; i < n; i++) m[i] = out[i] ? 0 : 1;
  m = morph(m, 2, false); // stay a few cells away from edges
  let frac = 0; for (let i = 0; i < n; i++) frac += m[i]; frac /= n;
  const isSky = (x, y) => { const xx = Math.floor(x / F), yy = Math.floor(y / F); return xx >= 0 && yy >= 0 && xx < w4 && yy < h4 && m[yy * w4 + xx] === 1; };
  return { isSky, frac, mask: m, w4, h4, F };
}


// ---------- line segments (LSD-style region growing) ----------
function lineSegments(g, w, h, keep, opts = {}) {
  const minLen = opts.minLen || 40, magT = opts.mag || 36;
  const n = w * h, ang = new Float32Array(n), mag = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (keep && !keep(x, y)) continue;
    const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - 1] + g[i + w - 1]);
    const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1]);
    const m = Math.hypot(gx, gy); if (m < magT) continue;
    mag[i] = m; ang[i] = Math.atan2(gy, gx);
  }
  // seeds by decreasing gradient
  const seeds = []; for (let i = 0; i < n; i++) if (mag[i] > 0) seeds.push(i);
  seeds.sort((a, b) => mag[b] - mag[a]);
  const used = new Uint8Array(n), segs = [], tol = 22.5 * D2R, q = [];
  const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
  for (const s0 of seeds) {
    if (used[s0]) continue;
    let regAng = ang[s0], sx = Math.cos(regAng), sy = Math.sin(regAng);
    const reg = [s0]; used[s0] = 1; q.length = 0; q.push(s0);
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        const k = yy * w + xx; if (used[k] || mag[k] === 0 || angDiff(ang[k], regAng) > tol) continue;
        used[k] = 1; reg.push(k); q.push(k); sx += Math.cos(ang[k]); sy += Math.sin(ang[k]); regAng = Math.atan2(sy, sx);
      }
    }
    if (reg.length < minLen * 0.8) continue;
    // principal axis
    let mx = 0, my = 0, wsum = 0; for (const i of reg) { const m = mag[i]; mx += m * (i % w); my += m * ((i / w) | 0); wsum += m; } mx /= wsum; my /= wsum;
    let cxx = 0, cyy = 0, cxy = 0; for (const i of reg) { const m = mag[i], dx = (i % w) - mx, dy = ((i / w) | 0) - my; cxx += m * dx * dx; cyy += m * dy * dy; cxy += m * dx * dy; }
    const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), ux = Math.cos(th), uy = Math.sin(th);
    let tmin = 1e9, tmax = -1e9, wid = 0;
    for (const i of reg) { const dx = (i % w) - mx, dy = ((i / w) | 0) - my, t = dx * ux + dy * uy; if (t < tmin) tmin = t; if (t > tmax) tmax = t; wid += Math.abs(-dx * uy + dy * ux); }
    const len = tmax - tmin; wid /= reg.length;
    if (len < minLen || wid > 2.5 || len / Math.max(1, reg.length) > 1.6) continue;
    segs.push({ x1: mx + 0.5 + tmin * ux, y1: my + 0.5 + tmin * uy, x2: mx + 0.5 + tmax * ux, y2: my + 0.5 + tmax * uy, len, n: reg.length });
  }
  return segs.sort((a, b) => b.len - a.len);
}

// ---------- automatic vertical edges ----------
// Once the stars have fixed the camera, every truly vertical edge in the photo (building corners,
// window sides, poles) lies in a plane through the zenith. Try the zenith implied by each pair of
// edges, and keep the one that the most separate edges agree with, among zeniths that keep the
// photo roughly upright and every identified star above the horizon.
function findVerticals(g, w, h, cam, sky, starVecs, opts = {}) {
  const { cross, norm, dot: d3, mulMV, mulMtV } = S;
  const segs = lineSegments(g, w, h, sky ? (x, y) => !sky.isSky(x, y) : null, { minLen: Math.max(35, 0.022 * Math.hypot(w, h)) }).slice(0, 80);
  if (segs.length < 2) return null;
  const items = segs.map(s => {
    const r1 = mulMtV(cam.R, S.camRay(cam, s.x1, s.y1)), r2 = mulMtV(cam.R, S.camRay(cam, s.x2, s.y2));
    const sep = Math.acos(Math.min(1, d3(r1, r2)));
    return { s, r1, r2, mid: norm([r1[0] + r2[0], r1[1] + r2[1], r1[2] + r2[2]]), n: norm(cross(r1, r2)), sep, sig: (0.7 / cam.f) * Math.SQRT2 / Math.max(sep, 1e-3) };
  }).filter(it => it.sep > 0.6 * D2R);
  const sinMin = Math.sin(1 * D2R), c0 = S.camRay(cam, cam.cx, cam.cy), cosRoll = Math.cos((opts.maxRollDeg || 55) * D2R), cosNear = Math.cos((opts.nearDeg || 20) * D2R);
  const projC = c => { const x = c[0] / c[2], y = c[1] / c[2], dd = 1 + cam.k1 * (x * x + y * y); return [cam.cx + cam.f * x * dd, cam.cy + cam.f * y * dd]; };
  const upright = z => { const zc = mulMV(cam.R, z), t = [zc[0] - d3(zc, c0) * c0[0], zc[1] - d3(zc, c0) * c0[1], zc[2] - d3(zc, c0) * c0[2]]; const tl = Math.hypot(t[0], t[1], t[2]); if (tl < 1e-6) return true; const e = 2e-3 / tl, p1 = projC(c0), p2 = projC([c0[0] + e * t[0], c0[1] + e * t[1], c0[2] + e * t[2]]); const dx = p2[0] - p1[0], dy = p2[1] - p1[1]; return -dy / Math.hypot(dx, dy) > cosRoll; };
  const valid = z => starVecs.every(v => d3(v, z) > sinMin) && upright(z);
  const support = z => {
    let sc = 0; const inl = [];
    for (let k = 0; k < items.length; k++) {
      const it = items[k]; if (Math.abs(d3(it.mid, z)) > cosNear) continue; // edges pointing almost at the zenith can't tell
      const res = Math.abs(d3(it.n, z)); if (res < Math.min(1.0 * D2R, Math.max(0.5 * D2R, 2 * it.sig))) { sc += Math.min(1, it.s.len / 120); inl.push(k); }
    }
    return { sc, inl };
  };
  let best = null, second = null;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    let z = cross(items[i].n, items[j].n); const zl = Math.hypot(z[0], z[1], z[2]); if (zl < Math.sin(3 * D2R)) continue;
    z = [z[0] / zl, z[1] / zl, z[2] / zl];
    for (const zz of [z, [-z[0], -z[1], -z[2]]]) {
      if (!valid(zz)) continue;
      const r = support(zz); if (r.inl.length < 2) continue;
      if (!best || r.sc > best.sc) { if (best && d3(best.z, zz) < Math.cos(3 * D2R)) second = best; best = { z: zz, ...r }; }
      else if ((!second || r.sc > second.sc) && d3(best.z, zz) < Math.cos(3 * D2R)) second = { z: zz, ...r };
    }
  }
  if (!best || best.inl.length < 3) return null;
  return {
    z: best.z, support: best.sc, runnerUp: second ? second.sc : 0, nSegments: items.length,
    lines: best.inl.map(k => [{ x: items[k].s.x1, y: items[k].s.y1 }, { x: items[k].s.x2, y: items[k].s.y2 }]),
    confident: best.inl.length >= 3 && (!second || best.sc >= 1.5 * second.sc)
  };
}


// ---------- satellite / aircraft trails ----------
// A trail breaks into a string of look-alike points along one straight line. Chance alignment of
// 8 real stars within 1.5 px of a line is vanishingly rare, so any such string is removed.
function removeTrails(dets, W, H, opts = {}) {
  const minN = opts.minPoints || 8, tol = opts.tolPx || 1.5, minSpan = (opts.minSpanFrac || 0.06) * Math.hypot(W, H);
  // only the brightest points matter (trail fragments are bright); the rest pass through untouched
  const HEAD = opts.head || 400, tail = dets.slice(HEAD);
  let pts = dets.slice(0, HEAD), removed = 0;
  for (let pass = 0; pass < 8; pass++) {
    const top = pts.slice(0, 220); let best = null;
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const a = top[i], b = top[j], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < minSpan) continue;
      const nx = -dy / L, ny = dx / L; let n = 0, tmin = 0, tmax = L;
      for (const p of pts) { const d = (p.x - a.x) * nx + (p.y - a.y) * ny; if (d > tol || d < -tol) continue; n++; const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
      // how many would line up by chance in a field this crowded? demand far more than that
      const expect = pts.length * 2 * tol * (tmax - tmin) / (W * H), need = Math.max(minN, expect + 5 * Math.sqrt(expect) + 3);
      if (n >= need && (!best || n > best.n)) best = { a, nx, ny, n };
    }
    if (!best) break;
    const before = pts.length;
    pts = pts.filter(p => Math.abs((p.x - best.a.x) * best.nx + (p.y - best.a.y) * best.ny) > tol);
    removed += before - pts.length;
  }
  return { dets: pts.concat(tail), removed };
}

// ---------- automatic horizon ----------
function detectHorizon(g, w, h) {
  const cols = 36, cand = [];
  const half = Math.max(8, Math.round(h * 0.012));
  for (let c = 0; c < cols; c++) {
    const x = Math.round((c + 0.5) * w / cols), prof = new Float64Array(h);
    for (let y = 0; y < h; y++) { let s = 0, m = 0; for (let dx = -4; dx <= 4; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) { s += g[y * w + xx]; m++; } } prof[y] = s / m; }
    // median-ish robustness against stars: clip each sample to local window min*... use running 5-sample min
    const lo = new Float64Array(h); for (let y = 0; y < h; y++) { let m = 1e9; for (let d = -2; d <= 2; d++) { const yy = Math.min(h - 1, Math.max(0, y + d)); if (prof[yy] < m) m = prof[yy]; } lo[y] = m; }
    const P = new Float64Array(h + 1); for (let y = 0; y < h; y++) P[y + 1] = P[y] + lo[y];
    let best = -1e9, by = -1, sc2 = 0;
    for (let y = Math.round(0.12 * h); y < h - half - 2; y++) {
      const above = (P[y] - P[y - half]) / half, below = (P[y + 1 + half] - P[y + 1]) / half;
      const sc = above - below; if (sc > best) { best = sc; by = y; }
    }
    // contrast relative to sky noise
    let v = 0; for (let y = Math.max(half, by - 4 * half); y < by - half; y++) v += (lo[y] - lo[y + 1]) ** 2; sc2 = Math.sqrt(v / Math.max(1, 3 * half)) + 0.5;
    if (by > 0 && best > 3 && best > 4 * sc2) cand.push({ x, y: by + 0.5, s: best });
  }
  if (cand.length < cols * 0.4) return null;
  // RANSAC line y = a x + b
  let bestIn = null;
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
    const p = cand[i], q = cand[j]; if (Math.abs(q.x - p.x) < w * 0.15) continue;
    const a = (q.y - p.y) / (q.x - p.x), b = p.y - a * p.x; if (Math.abs(a) > 0.6) continue;
    const inl = cand.filter(r => Math.abs(r.y - (a * r.x + b)) < 0.03 * h);
    if (!bestIn || inl.length > bestIn.length) bestIn = inl;
  }
  if (!bestIn || bestIn.length < Math.max(6, cols * 0.4)) return null;
  const span = bestIn[bestIn.length - 1].x - bestIn[0].x; if (span < 0.45 * w) return null;
  // choose up to 9 evenly spread inliers, refine each on the edge
  const out = []; const want = Math.min(9, bestIn.length);
  for (let k = 0; k < want; k++) { const p = bestIn[Math.round(k * (bestIn.length - 1) / Math.max(1, want - 1))]; const s = S.snapEdge(g, w, h, p.x, p.y, half); out.push({ x: p.x, y: s.y }); }
  return out.filter((p, i, a) => a.findIndex(q => q.x === p.x) === i);
}
// is a point below the detected/marked horizon polyline?
function belowFn(pts, margin) {
  if (!pts || pts.length < 2) return () => false;
  const s = pts.slice().sort((a, b) => a.x - b.x);
  return (x, y) => {
    let i = 0; while (i < s.length - 2 && s[i + 1].x < x) i++;
    const p = s[i], q = s[i + 1], t = (x - p.x) / ((q.x - p.x) || 1);
    return y > p.y + t * (q.y - p.y) - margin;
  };
}

const api = { removeTrails, lineSegments, findVerticals, skyMask, buildIndex, recognize, detectHorizon, belowFn, constellationsOf, CON };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StarfixPattern = api;
})(typeof window !== "undefined" ? window : globalThis);
