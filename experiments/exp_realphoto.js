/* Exports the full solution for the real test photograph (for the paper's figure and case study).
   Needs the site served locally and Playwright.
   node experiments/exp_realphoto.js <photo> <site url> > experiments/results/real_photo.json */
"use strict";
const { chromium } = require("playwright"); const fs = require("fs");
(async () => {
  const [photo, url] = process.argv.slice(2);
  const b = await chromium.launch(), page = await b.newPage();
  await page.route("**/*", r => /localhost|127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  const data = "data:image/jpeg;base64," + fs.readFileSync(photo).toString("base64");
  const out = await page.evaluate(async (data) => {
    const S = window.Starfix, ML = window.StarfixML, P = window.StarfixPattern;
    const model = await (await fetch("models/star_detector.json")).json(), acc = await (await fetch("models/accuracy_model.json")).json();
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = data; });
    const sc = Math.min(1, 2000 / Math.max(img.width, img.height)), W = Math.round(img.width * sc), H = Math.round(img.height * sc);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(img, 0, 0, W, H);
    const gray = S.toGray(g.getImageData(0, 0, W, H)), sky = P.skyMask(gray, W, H);
    const raw = S.detectStars(gray, W, H, 2000, sky.isSky).stars;
    let dets = raw.filter(d => { const f = ML.patchFeatures(gray, W, H, d.x, d.y); return !f || ML.mlpForward(model, f) >= model.threshold; });
    const nML = dets.length; const tr = P.removeTrails(dets, W, H); dets = tr.dets.slice(0, 300);
    const truth = { lat: 40.1164, lon: -88.2434 };
    const jd = S.jdFromDate(new Date("2026-11-12T07:01:00Z")), cat = S.catalogOfDate(jd, []);
    const r = await P.recognize(dets, W, H, cat, {});
    const s0 = S.solve({ W, H, jd, ids: r.ids, detections: dets, horizon: [], verticals: [] });
    const used = s0.matches.filter(m => m.used).map(m => cat.get(m.key).v);
    const fv = P.findVerticals(gray, W, H, s0.cam, sky, used);
    const segs = P.lineSegments(gray, W, H, (x, y) => !sky.isSky(x, y), { minLen: Math.max(35, 0.022 * Math.hypot(W, H)) }).slice(0, 80);
    const s1 = S.solve({ W, H, jd, ids: r.ids, detections: dets, horizon: [], verticals: fv.lines, timeSigmaSec: 120 });
    const x = ML.accuracyFeatures(s1.features), sig = m => Math.exp(ML.gbtPredict(m, x) + acc.euler) * m.scale;
    // true zenith in pixel coordinates
    const lst = (S.gmstDeg(jd) + truth.lon) * Math.PI / 180, la = truth.lat * Math.PI / 180;
    const zt = [Math.cos(la) * Math.cos(lst), Math.cos(la) * Math.sin(lst), Math.sin(la)];
    const zPx = S.project(s1.cam, zt), zFit = S.project(s1.cam, s1.zen.z);
    return { W, H, rawCandidates: raw.length, afterDetector: nML, trailsRemoved: tr.removed, recognisedStars: r.ids.length, constellations: r.constellations,
      matches: s1.matches.map(m => ({ name: m.name, x: m.x, y: m.y, mag: m.mag, used: m.used, source: m.source, resArcmin: m.resArcmin })),
      verticalsFound: fv.lines, verticalsKept: s1.keptVerticals, steepSegments: segs.length,
      fix: { lat: s1.lat, lon: s1.lon, errKm: S.haversineKm(truth.lat, truth.lon, s1.lat, s1.lon), sigLearnedKm: [sig(acc.north_south), sig(acc.east_west)] },
      camera: { f35: s1.cam.f / Math.hypot(W, H) * 43.27, k1: s1.cam.k1, tiltDeg: s1.pointing.alt, azDeg: s1.pointing.az, rmsArcmin: s1.rmsArcmin, nUsed: s1.nUsed },
      zenithTruePx: zPx, zenithFitPx: zFit };
  }, data);
  console.log(JSON.stringify(out)); await b.close();
})();
