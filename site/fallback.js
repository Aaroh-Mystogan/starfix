/* Starfix fallbacks: what the page can still say when the star fix can't be completed.
   - the Moon: its height above the horizon at a known moment puts you on a circle on Earth
   - a rough region: combine every constraint that survives (stars above the horizon, the
     time-zone band, the Moon circle) on a world grid and report where they agree */
(function (root) {
"use strict";
const S = (typeof module !== "undefined" && module.exports) ? require("./solver.js") : root.Starfix;
const { D2R, R2D, dot, norm, cross } = S;

// ---------- find the Moon: the biggest bright, round blob in the sky ----------
function findMoon(g, w, h, sky) {
  let best = null;
  const seen = new Uint8Array(w * h), q = [];
  let thr = 0; { const s = []; for (let i = 0; i < g.length; i += 53) s.push(g[i]); s.sort((a, b) => a - b); thr = Math.max(200, s[Math.floor(0.995 * (s.length - 1))]); }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (seen[i] || g[i] < thr) continue;
    if (sky && !sky.isSky(x, y)) continue;
    let n = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y; q.length = 0; q.push(i); seen[i] = 1;
    while (q.length) { const j = q.pop(), xx = j % w, yy = (j / w) | 0; n++; sx += xx; sy += yy; if (xx < minx) minx = xx; if (xx > maxx) maxx = xx; if (yy < miny) miny = yy; if (yy > maxy) maxy = yy;
      for (const k of [j - 1, j + 1, j - w, j + w]) if (k >= 0 && k < g.length && !seen[k] && g[k] >= thr) { seen[k] = 1; q.push(k); } }
    const bw = maxx - minx + 1, bh = maxy - miny + 1, fill = n / (bw * bh), round = Math.min(bw, bh) / Math.max(bw, bh);
    if (n < 40 || round < 0.6 || fill < 0.5) continue;
    if (!best || n > best.n) best = { x: sx / n + 0.5, y: sy / n + 0.5, r: Math.sqrt(n / Math.PI), n };
  }
  return best;
}

// Moon geocentric position (true-of-date unit vector) and distance in km, via astronomy-engine
function moonOfDate(date) {
  const A = root.Astronomy; if (!A) return null;
  try {
    const v = A.GeoVector("Moon", date, true), l = Math.hypot(v.x, v.y, v.z);
    const P = S.precessionMatrix(S.jdFromDate(date));
    return { v: norm(S.mulMV(P, [v.x / l, v.y / l, v.z / l])), km: l * 149597870.7 };
  } catch (_) { return null; }
}

// zenith in the camera frame from horizon points / vertical edges, given only the lens (no star fit)
function zenithFromCues(f, W, H, cues, towards) {
  const cam = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], f, k1: 0, cx: W / 2, cy: H / 2 };
  const z = S.solveZenith(cam, { ...cues, tapSigmaPx: 1.2 }, [towards]);
  return z ? { z: z.z, cam } : null;
}

// Circle of position from the Moon's measured height above the horizon at a known time.
// Returns { gpLat, gpLon, radiusDeg, sigmaDeg, hObs }.
function moonCircle(moonPx, f, W, H, cues, date, horizonAlt, sigmaHorizonDeg) {
  const m = moonOfDate(date); if (!m) return null;
  const cam0 = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], f, k1: 0, cx: W / 2, cy: H / 2 };
  const ray = S.camRay(cam0, moonPx.x, moonPx.y);
  const zz = zenithFromCues(f, W, H, cues, ray); if (!zz) return null;
  const hObs = Math.asin(Math.max(-1, Math.min(1, dot(ray, zz.z)))) * R2D - (horizonAlt || 0);
  if (hObs < 1) return null;
  const refr = S.refractionDeg(hObs - S.refractionDeg(hObs));           // apparent -> true
  const HP = Math.asin(6378.14 / m.km) * R2D;                             // horizontal parallax
  const hGeo = hObs - refr + HP * Math.cos(hObs * D2R);                   // topocentric -> geocentric
  const { ra, dec } = S.vec2radec(m.v);
  let gpLon = ra - S.gmstDeg(S.jdFromDate(date)); gpLon = ((gpLon + 540) % 360) - 180;
  return { gpLat: dec, gpLon, radiusDeg: 90 - hGeo, sigmaDeg: Math.hypot(sigmaHorizonDeg || 0.5, 0.35), hObs, moonPx };
}

// ---------- rough region on a world grid ----------
// constraints: { starsUp: [unit vectors of date], jd, tzOffset, tzSigma, moon: circle, gps }
function roughRegion(c) {
  const step = 1;
  const cells = []; let wsum = 0;
  const gmst = c.jd != null ? S.gmstDeg(c.jd) : null;
  // people take photos where people live: weight by distance to the nearest reference place
  const places = (root.StarfixPlaces ? root.StarfixPlaces.PLACES : []).map(p => [Math.cos(p.lat * D2R) * Math.cos(p.lon * D2R), Math.cos(p.lat * D2R) * Math.sin(p.lon * D2R), Math.sin(p.lat * D2R)]);
  const cos500 = Math.cos(500 / 6371);
  const popWeight = (u) => { if (!places.length) return 1; let best = -1; for (const p of places) { const d = p[0] * u[0] + p[1] * u[1] + p[2] * u[2]; if (d > best) best = d; } const dk = Math.acos(Math.min(1, best)) * 6371; return 0.15 + 0.85 * Math.exp(-0.5 * (dk / 500) ** 2); };
  void cos500;
  for (let lat = -89.5; lat < 90; lat += step) for (let lon = -179.5; lon < 180; lon += step) {
    let w = Math.cos(lat * D2R); // equal-area weighting
    if (c.starsUp && c.starsUp.length && gmst != null) {
      const lst = (gmst + lon) * D2R, z = [Math.cos(lat * D2R) * Math.cos(lst), Math.cos(lat * D2R) * Math.sin(lst), Math.sin(lat * D2R)];
      let ok = true; for (const v of c.starsUp) { if (dot(v, z) < Math.sin(3 * D2R)) { ok = false; break; } }
      if (!ok) continue;
      if (c.camR) {
        // photos are taken roughly upright: straight up points toward the top of the frame
        const zc = S.mulMV(c.camR, z), tilt = Math.asin(Math.max(-1, Math.min(1, zc[2]))) * R2D;
        if (tilt > 88 || tilt < 2) { if (tilt < 2) continue; }
        else { const roll = Math.atan2(zc[0], -zc[1]) * R2D; w *= Math.exp(-0.5 * (roll / (c.rollSigma || 30)) ** 2); }
      }
    }
    w *= popWeight([Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)]);
    if (c.tzOffset != null) {
      let d = ((lon - c.tzOffset * 15 + 540) % 360) - 180; // political zones are wide and skewed
      w *= Math.exp(-0.5 * (d / (c.tzSigma || 12)) ** 2);
    }
    if (c.moon) {
      const dd = S.haversineKm(lat, lon, c.moon.gpLat, c.moon.gpLon) / 111.2;
      w *= Math.exp(-0.5 * ((dd - c.moon.radiusDeg) / c.moon.sigmaDeg) ** 2);
    }
    if (w < 1e-6) continue;
    cells.push({ lat, lon, w }); wsum += w;
  }
  if (!cells.length || wsum <= 0) return null;
  // weighted centre on the sphere, and the spread around it
  let X = 0, Y = 0, Z = 0;
  for (const p of cells) { const a = p.lat * D2R, b = p.lon * D2R; X += p.w * Math.cos(a) * Math.cos(b); Y += p.w * Math.cos(a) * Math.sin(b); Z += p.w * Math.sin(a); }
  const n = norm([X, Y, Z]), cLat = Math.asin(n[2]) * R2D, cLon = Math.atan2(n[1], n[0]) * R2D;
  let s2 = 0; for (const p of cells) { const d = S.haversineKm(cLat, cLon, p.lat, p.lon); s2 += p.w * d * d; }
  const spreadKm = Math.sqrt(s2 / wsum);
  // area holding 90% of the weight
  const sorted = cells.slice().sort((a, b) => b.w - a.w); let acc = 0, area = 0;
  for (const p of sorted) { if (acc > 0.9 * wsum) break; acc += p.w; area += 111.2 * 111.2 * Math.cos(p.lat * D2R) * step * step; }
  const peak = sorted[0];
  return { cells, wsum, lat: cLat, lon: cLon, peak, spreadKm, area90: area, centreIsSpread: spreadKm > 3000 };
}

const api = { findMoon, moonOfDate, moonCircle, roughRegion, zenithFromCues };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StarfixFallback = api;
})(typeof window !== "undefined" ? window : globalThis);
