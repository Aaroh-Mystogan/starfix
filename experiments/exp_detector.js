/* Experiment 4 (part 3): full pipeline on rendered photos, trained star detector on vs off.
   Needs the site served locally (python serve.py, or python -m http.server 8765 in site/) and Playwright.
   node experiments/exp_detector.js <scenes.json> <photos dir> <site url> [model url] > results/detector.json */
"use strict";
const { chromium } = require("playwright"); const fs = require("fs"), path = require("path");
(async () => {
  const [scenesPath, photos, url, modelUrl] = process.argv.slice(2);
  const scenes = JSON.parse(fs.readFileSync(scenesPath));
  const b = await chromium.launch(), page = await b.newPage();
  await page.route("**/*", r => /localhost|127\.0\.0\.1/.test(r.request().url()) ? r.continue() : r.abort());
  await page.goto(url);
  const rows = [];
  for (const sc of scenes) {
    const data = "data:image/jpeg;base64," + fs.readFileSync(path.join(photos, `scene_${String(sc.id).padStart(3, "0")}.jpg`)).toString("base64");
    const r = await page.evaluate(async ([sc, data, modelUrl]) => {
      const S = window.Starfix, ML = window.StarfixML, P = window.StarfixPattern;
      window.__m = window.__m || await (await fetch(modelUrl || "models/star_detector.json")).json();
      const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = data; });
      const W = img.width, H = img.height, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const gray = S.toGray(g.getImageData(0, 0, W, H)), sky = P.skyMask(gray, W, H), inSky = sky.frac > 0.1 ? sky.isSky : undefined;
      const jd = S.jdFromDate(new Date(sc.utc)), cat = S.catalogOfDate(jd, []), hz = P.detectHorizon(gray, W, H);
      const truth = sc.stars.filter(s => s.mag < 3.7);
      const out = {};
      for (const mode of ["on", "off"]) {
        let dets;
        if (mode === "on") { const raw = S.detectStars(gray, W, H, 2000, inSky).stars; dets = raw.filter(d => { const f = ML.patchFeatures(gray, W, H, d.x, d.y); return !f || ML.mlpForward(window.__m, f) >= window.__m.threshold; }); }
        else dets = S.detectStars(gray, W, H, 250, inSky).stars;
        dets = P.removeTrails(dets, W, H).dets.slice(0, 300); // geometric trail filter, applied in both modes
        const t0 = performance.now();
        const rec = await P.recognize(dets, W, H, cat, { belowHorizon: P.belowFn(hz, 6), timeLimitMs: 12000 });
        const o = { nDet: dets.length, recognised: rec.ok, ms: Math.round(performance.now() - t0) };
        if (rec.ok) {
          o.wrong = rec.ids.filter(id => !truth.some(s => s.name === id.name && Math.hypot(s.x - id.x, s.y - id.y) < 3)).length;
          if (hz && hz.length >= 2) { const s1 = S.solve({ W, H, jd, ids: rec.ids, detections: dets, horizon: hz, verticals: [], horizonType: "flat", timeSigmaSec: 2 }); if (s1.ok && s1.lat != null) o.errKm = S.haversineKm(sc.lat, sc.lon, s1.lat, s1.lon); }
        }
        out[mode] = o;
      }
      return out;
    }, [sc, data, modelUrl]);
    rows.push({ id: sc.id, hot: sc.hot, trails: sc.trails, nStars: sc.stars.length, ...r });
    process.stderr.write(`  scene ${sc.id}: on ${r.on.recognised ? (r.on.errKm ?? NaN).toFixed(1) + " km" : "FAIL"} | off ${r.off.recognised ? (r.off.errKm ?? NaN).toFixed(1) + " km" : "FAIL"}\n`);
  }
  console.log(JSON.stringify(rows)); await b.close();
})();
