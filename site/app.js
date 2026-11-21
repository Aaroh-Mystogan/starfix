/* Starfix app: photo in, location out. Runs entirely in the browser. */
(() => {
  "use strict";
  const S = window.Starfix, P = window.StarfixPattern, PL = window.StarfixPlaces, FB = window.StarfixFallback, D2R = Math.PI / 180;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const ML = window.StarfixML, MODELS = { detector: null, accuracy: null };
  const loadModel = (name, file) => fetch("models/" + file).then(r => r.ok ? r.json() : null).then(m => { MODELS[name] = m; }).catch(() => {});
  const modelsReady = Promise.all([loadModel("detector", "star_detector.json"), loadModel("accuracy", "accuracy_model.json")]);

  const st = {
    file: null, meta: {}, W: 0, H: 0, work: null, gray: null, dets: [],
    ids: [], recog: null, excluded: new Set(), planets: [],
    horizon: [], verticals: [], pending: null, mode: "h", sel: null, history: [], autoHorizon: false,
    result: null, when: null, timeFromExif: null, busy: false, f35: null, view: null,
    sky: null, moon: null, autoVerticals: false, rough: null
  };

  // ---------------- EXIF ----------------
  function readExif(buf) {
    const v = new DataView(buf), out = {};
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return out;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off), len = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { parseTiff(v, off + 10, out); break; }
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + len;
    }
    return out;
  }
  function parseTiff(v, t, out) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le), s32 = o => v.getInt32(o, le);
    const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    function val(e) {
      const type = u16(e + 2), count = u32(e + 4), size = (sizes[type] || 1) * count;
      const p = size > 4 ? t + u32(e + 8) : e + 8;
      if (p + size > v.byteLength) return null;
      if (type === 2) { let s = ""; for (let i = 0; i < count; i++) { const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
      if (type === 3) return count === 1 ? u16(p) : Array.from({ length: count }, (_, i) => u16(p + i * 2));
      if (type === 4) return count === 1 ? u32(p) : Array.from({ length: count }, (_, i) => u32(p + i * 4));
      if (type === 5 || type === 10) {
        const r = i => { const n = type === 5 ? u32(p + i * 8) : s32(p + i * 8), d = type === 5 ? u32(p + i * 8 + 4) : s32(p + i * 8 + 4); return d ? n / d : 0; };
        return count === 1 ? r(0) : Array.from({ length: count }, (_, i) => r(i));
      }
      return null;
    }
    function ifd(start, map) {
      if (start < t || start + 2 > v.byteLength) return;
      const n = u16(start);
      for (let i = 0; i < n; i++) { const e = start + 2 + i * 12; if (e + 12 > v.byteLength) break; const f = map[u16(e)]; if (f) { try { f(val(e)); } catch (_) {} } }
    }
    const exif = {
      0x9003: x => out.dateOriginal = x, 0x9011: x => out.offset = x, 0x9291: x => out.subsec = x,
      0x829A: x => out.exposure = x, 0x920A: x => out.focal = x, 0xA405: x => out.f35 = x, 0xA434: x => out.lens = x
    };
    const gps = {};
    const gpsT = { 1: x => gps.latRef = x, 2: x => gps.lat = x, 3: x => gps.lonRef = x, 4: x => gps.lon = x };
    ifd(t + u32(t + 4), { 0x010F: x => out.make = x, 0x0110: x => out.model = x, 0x0132: x => out.date = x, 0x8769: x => ifd(t + x, exif), 0x8825: x => ifd(t + x, gpsT) });
    if (Array.isArray(gps.lat) && Array.isArray(gps.lon)) {
      const dms = a => a[0] + a[1] / 60 + a[2] / 3600;
      let lat = dms(gps.lat), lon = dms(gps.lon);
      if (gps.latRef === "S") lat = -lat; if (gps.lonRef === "W") lon = -lon;
      if (isFinite(lat) && isFinite(lon) && !(lat === 0 && lon === 0)) out.gps = { lat, lon };
    }
  }

  // ---------------- formatting ----------------
  const fmtLat = x => Math.abs(x).toFixed(4) + "° " + (x >= 0 ? "N" : "S");
  const fmtLon = x => Math.abs(x).toFixed(4) + "° " + (x >= 0 ? "E" : "W");
  const fmtKm = k => k < 1 ? "< 1 km" : k < 10 ? k.toFixed(1) + " km" : Math.round(k).toLocaleString() + " km";
  function setStatus(text, kind) {
    const s = $("status"); s.replaceChildren(); s.className = "status" + (kind === "err" ? " err" : "");
    if (kind === "busy") s.append(el("span", "pulse"));
    if (text) s.append(document.createTextNode(text));
  }

  // ---------------- date / time ----------------
  const tzSel = $("tz");
  const offs = [-12, -11, -10, -9.5, -9, -8, -7, -6, -5, -4, -3.5, -3, -2, -1, 0, 1, 2, 3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 8, 9, 9.5, 10, 10.5, 11, 12, 13, 14];
  const offLabel = h => { const s = h < 0 ? "−" : "+", a = Math.abs(h); return "UTC" + s + String(Math.floor(a)).padStart(2, "0") + ":" + String(Math.round((a % 1) * 60)).padStart(2, "0"); };
  tzSel.append(new Option("Not sure", ""));
  offs.forEach(h => tzSel.append(new Option(offLabel(h), String(h))));
  function readWhen() {
    const date = $("d").value, time = $("t").value, tz = tzSel.value;
    const w = { date, time, tz: tz === "" ? null : Number(tz), acc: Number($("acc").value) };
    if (date) { const [Y, M, D] = date.split("-").map(Number); w.jdDate = S.jdFromDate(new Date(Date.UTC(Y, M - 1, D, 12))); }
    if (date && time && w.tz != null) {
      const [Y, M, D] = date.split("-").map(Number), p = time.split(":").map(Number);
      let ms = Date.UTC(Y, M - 1, D, p[0], p[1] || 0, p[2] || 0) - w.tz * 3600e3;
      if (st.timeFromExif && st.timeFromExif === date + "T" + time) {
        if (st.meta.subsec) ms += Number("0." + String(st.meta.subsec).replace(/\D/g, "")) * 1000 || 0;
        if (st.meta.exposure) ms += st.meta.exposure * 500; // middle of the exposure
      }
      w.utc = new Date(ms); w.jd = S.jdFromDate(w.utc);
    }
    return w;
  }
  function prefillFromExif(m) {
    const d = m.dateOriginal || m.date; if (!d) return false;
    const [day, time] = d.split(" "); if (!/^\d{4}:\d\d:\d\d$/.test(day)) return false;
    $("d").value = day.replace(/:/g, "-");
    if (time) { $("t").value = time.slice(0, 8); st.timeFromExif = $("d").value + "T" + $("t").value; }
    const o = /^([+-])(\d\d):(\d\d)$/.exec(m.offset || "");
    if (o) { const h = (o[1] === "-" ? -1 : 1) * (Number(o[2]) + Number(o[3]) / 60); if (offs.includes(h)) tzSel.value = String(h); }
    $("acc").value = o ? "2" : "30";
    return true;
  }
  const syncGo = () => { $("go").disabled = !(st.file && $("d").value) || st.busy; };
  ["d", "t", "tz", "acc"].forEach(id => $(id).addEventListener("input", () => { syncGo(); if (st.when) scheduleSolve(); }));
  $("htype").addEventListener("input", () => { $("hgtField").hidden = $("htype").value !== "sea"; scheduleSolve(); });
  $("hgt").addEventListener("input", scheduleSolve);

  // ---------------- photo loading ----------------
  const fileIn = $("file"), drop = $("drop");
  async function loadPhoto(file) {
    if (!file || st.busy) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { setStatus("That file type isn't supported. For iPhone HEIC photos, export or share as JPEG first.", "err"); return; }
    st.busy = true; syncGo();
    setStatus("Measuring every point of light…", "busy");
    try {
      let meta = {};
      try { if (file.type === "image/jpeg") meta = readExif(await file.arrayBuffer()); } catch (_) {}
      let bmp;
      try { bmp = await createImageBitmap(file); }
      catch (_) { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
      const w0 = bmp.width, h0 = bmp.height, sc = Math.min(1, 2000 / Math.max(w0, h0));
      const W = Math.round(w0 * sc), H = Math.round(h0 * sc);
      const work = document.createElement("canvas"); work.width = W; work.height = H;
      const wctx = work.getContext("2d", { willReadFrequently: true }); wctx.drawImage(bmp, 0, 0, W, H);
      Object.assign(st, { file, meta, W, H, work, ids: [], recog: null, excluded: new Set(), horizon: [], verticals: [], pending: null, sel: null, history: [], result: null, when: null, timeFromExif: null, autoHorizon: false, autoVerticals: false, view: null, sky: null, moon: null, rough: null });
      st.f35 = meta.f35 || null;
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      st.gray = S.toGray(wctx.getImageData(0, 0, W, H));
      await modelsReady;
      // with the trained detector, look at many more candidates: junk can outshine faint stars
      st.sky = P.skyMask(st.gray, W, H);
      const inSky = st.sky.frac > 0.1 ? st.sky.isSky : undefined; // lit buildings, roofs and trees make false stars
      const raw = S.detectStars(st.gray, W, H, MODELS.detector ? 2000 : 250, inSky).stars;
      st.rejectedPoints = 0;
      if (MODELS.detector && ML) {
        // trained star detector: drop hot pixels, noise, lights, trails and edges
        const kept = [];
        for (const d of raw) { const f = ML.patchFeatures(st.gray, W, H, d.x, d.y); const p = f ? ML.mlpForward(MODELS.detector, f) : 1; d.pStar = p; if (p >= MODELS.detector.threshold) kept.push(d); }
        st.rejectedPoints = raw.length - kept.length;
        st.dets = kept.length >= 8 ? kept : raw.slice(0, 250);
      } else st.dets = raw;
      // satellite and aircraft trails: strings of points along one straight line
      const tr = P.removeTrails(st.dets, W, H); st.dets = tr.dets.slice(0, 300); st.rejectedPoints += tr.removed;
      const view = $("view"); view.width = W; view.height = H;
      drop.hidden = true; $("plate").hidden = false; $("example").hidden = true; $("fix").hidden = true;
      $("d").value = ""; $("t").value = ""; tzSel.value = ""; $("acc").value = "600";
      const filled = prefillFromExif(meta);
      // horizon: find it automatically, the person can adjust
      const hz = P.detectHorizon(st.gray, W, H);
      if (hz && hz.length >= 3) { st.horizon = hz; st.autoHorizon = true; }
      updateTools(); render();
      // recognise the star pattern
      setStatus("Recognising the star pattern…", "busy");
      const cat = S.catalogOfDate(S.jdFromDate(new Date()), []);
      const r = await P.recognize(st.dets, W, H, cat, {
        f35: st.f35, belowHorizon: P.belowFn(st.horizon, 6),
        onProgress: f => setStatus(`Recognising the star pattern… trying lens ${Math.round(f * 100)}%`, "busy")
      });
      st.recog = r;
      st.moon = FB ? FB.findMoon(st.gray, W, H, st.sky) : null;
      if (r.ok) {
        st.ids = r.ids;
        if (!st.horizon.length) {
          // no horizon: use vertical edges (building corners, window sides, poles) to find straight up
          setStatus("Looking for vertical edges to tell which way is up…", "busy");
          await new Promise(res => setTimeout(res, 0));
          const s0 = S.solve({ W, H, jd: null, jdDate: S.jdFromDate(new Date()), ids: st.ids, detections: st.dets, horizon: [], verticals: [] });
          if (s0.ok) {
            const used = s0.matches.filter(m => m.used).map(m => cat.get(m.key)).filter(Boolean).map(c => c.v);
            const fv = P.findVerticals(st.gray, W, H, s0.cam, st.sky, used);
            if (fv && fv.lines.length >= 3) { st.verticals = fv.lines; st.autoVerticals = true; }
          }
        }
        let msg = `Recognised ${r.constellations.slice(0, 3).join(", ")} (${r.ids.length} stars).`;
        if (st.rejectedPoints) msg += ` The trained detector and trail filter set aside ${st.rejectedPoints} points that weren't stars.`;
        if (!r.confident) msg += " The match is weaker than usual; check the star names on the photo.";
        if (st.horizon.length) msg += " The horizon was found automatically; drag any point that sits off the true edge.";
        else if (st.autoVerticals) msg += ` No horizon, so it found ${st.verticals.length} vertical edges on buildings to tell which way is up (green lines). Delete any that aren't truly vertical.`;
        else msg += " Mark the horizon, or trace 2 vertical edges such as building corners, so the page knows which way is up.";
        if (meta.gps) msg += ` This photo has a GPS tag (${meta.gps.lat.toFixed(4)}, ${meta.gps.lon.toFixed(4)}), so you can test the star fix against it.`;
        msg += filled ? " Date and time came from the photo; check them, then press Find location." : " Add the date and time, then press Find location.";
        setStatus(msg);
      } else {
        const n = st.dets.length;
        const fb = [meta.gps ? "the photo's GPS tag" : "", st.moon ? "the Moon" : "", "the time zone"].filter(Boolean).join(", ");
        setStatus((n < 12
          ? `Only ${n} stars were found, which isn't enough to recognise the sky.`
          : "Couldn't recognise the star pattern (very zoomed-in shots, heavy editing, clouds and star trails usually fail).")
          + ` Add the date and time and press Find location for a rough answer from ${fb}.`, "err");
      }
      render();
      if (!filled) $("d").focus();
    } catch (e) {
      setStatus("That image couldn't be opened. Try a JPEG or PNG.", "err");
    } finally { st.busy = false; syncGo(); updateTools(); }
  }
  fileIn.addEventListener("change", () => loadPhoto(fileIn.files[0]));
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => loadPhoto(e.dataTransfer.files[0]));
  document.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) loadPhoto(f); });
  $("replace").addEventListener("click", () => { fileIn.value = ""; fileIn.click(); });

  // ---------------- marking UI ----------------
  const view = $("view"), loupe = $("loupe");
  const toImg = e => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) * st.W / r.width, y: (e.clientY - r.top) * st.H / r.height, k: st.W / r.width }; };
  function pushHistory() { st.history.push(JSON.stringify({ h: st.horizon, v: st.verticals, p: st.pending })); if (st.history.length > 60) st.history.shift(); }
  function updateTools() {
    $("undo").disabled = !st.history.length;
    $("clear").disabled = !(st.horizon.length || st.verticals.length || st.pending);
    $("del").disabled = !st.sel;
    $("modeH").setAttribute("aria-pressed", st.mode === "h"); $("modeV").setAttribute("aria-pressed", st.mode === "v");
    const nh = st.horizon.length, nv = st.verticals.length, cap = $("cap"); cap.replaceChildren();
    if (st.mode === "h" && st.autoVerticals && st.verticals.length && !nh) cap.append(el("b", null, "Vertical edges found automatically."), document.createTextNode(` The ${nv} green lines should run along truly vertical edges (building corners, window sides, poles). Tap a line's end and press Delete point to drop one, or switch to Vertical edges to add more.`));
    else if (st.mode === "h") cap.append(el("b", null, st.autoHorizon && nh ? "Horizon found automatically." : "Tap along the horizon"), document.createTextNode(st.autoHorizon && nh ? ` Check the ${nh} red points sit exactly where sky meets land or sea; drag any that don't, or tap to add more. The magnifier shows the edge.` : ` where sky meets land or sea, at least 2 points spread wide (${nh} placed). Drag a point to fine-tune it with the magnifier. Points snap to the sharpest edge nearby.`));
    else cap.append(el("b", null, "Trace vertical edges"), document.createTextNode(` such as building corners, poles or towers: tap the bottom, then the top of each (${nv} traced). Use this when no clean horizon is visible.`));
  }
  function hit(p) {
    const r = 18 * p.k; let best = null, bd = r;
    st.horizon.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = { type: "h", i }; } });
    st.verticals.forEach((L, i) => L.forEach((q, j) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = { type: "v", i, j }; } }));
    if (st.pending) { const d = Math.hypot(st.pending.x - p.x, st.pending.y - p.y); if (d < bd) best = { type: "p" }; }
    return best;
  }
  const ptOf = h => h.type === "h" ? st.horizon[h.i] : h.type === "v" ? st.verticals[h.i][h.j] : st.pending;
  let drag = null;
  view.addEventListener("pointerdown", e => {
    if (!st.work) return;
    e.preventDefault(); view.setPointerCapture(e.pointerId);
    const p = toImg(e), h = hit(p);
    pushHistory();
    if (h) drag = { h, start: p, moved: false, existing: true };
    else if (st.mode === "h") { st.horizon.push({ x: p.x, y: p.y }); drag = { h: { type: "h", i: st.horizon.length - 1 }, start: p, moved: false, existing: false }; }
    else if (!st.pending) { st.pending = { x: p.x, y: p.y }; drag = { h: { type: "p" }, start: p, moved: false, existing: false }; }
    else { st.verticals.push([st.pending, { x: p.x, y: p.y }]); st.pending = null; drag = { h: { type: "v", i: st.verticals.length - 1, j: 1 }, start: p, moved: false, existing: false }; }
    st.sel = drag.h; showLoupe(p); render(); updateTools();
  });
  view.addEventListener("pointermove", e => {
    if (!st.work) return;
    const p = toImg(e);
    if (drag) {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 3 * p.k) drag.moved = true;
      const q = ptOf(drag.h); if (q) { q.x = Math.max(0, Math.min(st.W, p.x)); q.y = Math.max(0, Math.min(st.H, p.y)); }
      showLoupe(p); render();
    } else if (e.pointerType === "mouse") showLoupe(p);
  });
  function endDrag(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.existing && !d.moved) { st.history.pop(); st.sel = d.h; }
    else {
      const q = ptOf(d.h);
      if (q && d.h.type === "h" && $("snap").checked && st.gray) { const s = S.snapEdge(st.gray, st.W, st.H, q.x, q.y, 10 * toImg(e).k); q.y = s.y; }
      st.sel = d.h; scheduleSolve();
    }
    if (e.pointerType !== "mouse") loupe.hidden = true;
    render(); updateTools();
  }
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", endDrag);
  view.addEventListener("pointerleave", e => { if (!drag && e.pointerType === "mouse") loupe.hidden = true; });
  function showLoupe(p) {
    const Z = 5, src = 300 / Z; loupe.hidden = false;
    const left = (p.x / st.W) < 0.5 && (p.y / st.H) < 0.45;
    loupe.style.left = left ? "auto" : "10px"; loupe.style.right = left ? "10px" : "auto";
    const g = loupe.getContext("2d"); g.imageSmoothingEnabled = false;
    g.fillStyle = "#000"; g.fillRect(0, 0, 300, 300);
    g.drawImage(view, p.x - src / 2, p.y - src / 2, src, src, 0, 0, 300, 300);
    g.strokeStyle = css("--redlight"); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(150, 120); g.lineTo(150, 142); g.moveTo(150, 158); g.lineTo(150, 180); g.moveTo(120, 150); g.lineTo(142, 150); g.moveTo(158, 150); g.lineTo(180, 150); g.stroke();
  }
  $("modeH").addEventListener("click", () => { st.mode = "h"; st.pending = null; render(); updateTools(); });
  $("modeV").addEventListener("click", () => { st.mode = "v"; render(); updateTools(); });
  $("undo").addEventListener("click", () => { const s = st.history.pop(); if (!s) return; const o = JSON.parse(s); st.horizon = o.h; st.verticals = o.v; st.pending = o.p; st.sel = null; render(); updateTools(); scheduleSolve(); });
  $("clear").addEventListener("click", () => { pushHistory(); st.horizon = []; st.verticals = []; st.pending = null; st.sel = null; st.autoHorizon = false; st.autoVerticals = false; render(); updateTools(); scheduleSolve(); });
  $("del").addEventListener("click", () => {
    if (!st.sel) return; pushHistory();
    if (st.sel.type === "h") st.horizon.splice(st.sel.i, 1); else if (st.sel.type === "v") st.verticals.splice(st.sel.i, 1); else st.pending = null;
    st.sel = null; render(); updateTools(); scheduleSolve();
  });
  document.addEventListener("keydown", e => { if ((e.key === "Delete" || e.key === "Backspace") && st.sel && document.activeElement === document.body) { e.preventDefault(); $("del").click(); } });
  $("labels").addEventListener("change", render);

  // ---------------- drawing the photo overlay ----------------
  function render() {
    if (!st.work) return;
    const g = view.getContext("2d"), k = st.W / Math.max(1, view.getBoundingClientRect().width || st.W);
    g.drawImage(st.work, 0, 0);
    const R = st.result;
    if (R && R.horizonCurve) {
      g.save(); g.strokeStyle = css("--ok"); g.globalAlpha = .85; g.lineWidth = 1.5 * k; g.setLineDash([8 * k, 6 * k]); g.beginPath();
      let on = false; for (const q of R.horizonCurve) { if (!q) { on = false; continue; } if (!on) { g.moveTo(q[0], q[1]); on = true; } else g.lineTo(q[0], q[1]); }
      g.stroke(); g.restore();
    }
    const list = R && R.matches ? R.matches : st.ids.map(i => ({ ...i, used: true }));
    g.font = `600 ${12 * k}px ${css("--f-body")}`; g.textBaseline = "middle";
    for (const m of list) {
      const col = !m.used ? css("--redlight") : m.source === "auto" ? css("--auto") : css("--star");
      g.strokeStyle = col; g.lineWidth = 1.5 * k;
      g.beginPath(); g.arc(m.x, m.y, 9 * k, 0, Math.PI * 2); g.stroke();
      if (!m.used) { g.beginPath(); g.moveTo(m.x - 6 * k, m.y - 6 * k); g.lineTo(m.x + 6 * k, m.y + 6 * k); g.moveTo(m.x + 6 * k, m.y - 6 * k); g.lineTo(m.x - 6 * k, m.y + 6 * k); g.stroke(); }
      if ($("labels").checked && m.mag < 3.2) {
        g.lineWidth = 3 * k; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(m.name, m.x + 13 * k, m.y);
        g.fillStyle = col; g.fillText(m.name, m.x + 13 * k, m.y);
      }
    }
    const hs = st.horizon.slice().sort((a, b) => a.x - b.x);
    if (hs.length > 1) { g.strokeStyle = css("--redlight"); g.globalAlpha = .5; g.lineWidth = 1 * k; g.beginPath(); hs.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); g.globalAlpha = 1; }
    st.horizon.forEach((p, i) => diamond(g, p, k, css("--redlight"), st.sel && st.sel.type === "h" && st.sel.i === i));
    st.verticals.forEach((L, i) => {
      g.strokeStyle = css("--ok"); g.lineWidth = 2 * k; g.beginPath(); g.moveTo(L[0].x, L[0].y); g.lineTo(L[1].x, L[1].y); g.stroke();
      L.forEach((p, j) => dot(g, p, k, css("--ok"), st.sel && st.sel.type === "v" && st.sel.i === i && st.sel.j === j));
    });
    if (st.pending) dot(g, st.pending, k, css("--ok"), true);
    if (st.moon) { g.strokeStyle = css("--star"); g.lineWidth = 2 * k; g.setLineDash([4 * k, 4 * k]); g.beginPath(); g.arc(st.moon.x, st.moon.y, st.moon.r + 10 * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.fillStyle = css("--star"); g.font = `600 ${12 * k}px ${css("--f-body")}`; g.fillText("Moon", st.moon.x + st.moon.r + 14 * k, st.moon.y); }
  }
  function diamond(g, p, k, col, sel) {
    const s = (sel ? 8 : 6) * k; g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x + s, p.y); g.lineTo(p.x, p.y + s); g.lineTo(p.x - s, p.y); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = (sel ? 2.5 : 1.5) * k; g.strokeStyle = sel ? "#fff" : "#000"; g.stroke();
  }
  function dot(g, p, k, col, sel) { g.beginPath(); g.arc(p.x, p.y, (sel ? 7 : 5) * k, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = (sel ? 2.5 : 1.5) * k; g.strokeStyle = sel ? "#fff" : "#000"; g.stroke(); }
  addEventListener("resize", () => { render(); if (st.view) drawCharts(st.view); });

  // ---------------- planets ----------------
  function planetsFor(when) {
    const A = window.Astronomy; if (!A) return [];
    const date = when.utc || new Date((when.jdDate - 2440587.5) * 86400000);
    const out = [];
    for (const name of ["Venus", "Jupiter", "Mars", "Saturn", "Mercury"]) {
      try {
        const v = A.GeoVector(name, date, true), l = Math.hypot(v.x, v.y, v.z);
        const mag = A.Illumination(name, date).mag; if (mag > 2.5) continue;
        const eq = A.EquatorFromVector(v);
        out.push({ name, mag, con: A.Constellation(eq.ra, eq.dec).name, vJ2000: [v.x / l, v.y / l, v.z / l] });
      } catch (_) {}
    }
    return out;
  }

  // ---------------- solve ----------------
  let solveTimer = 0;
  function scheduleSolve() { clearTimeout(solveTimer); solveTimer = setTimeout(runSolve, 40); }
  function runSolve() {
    if (!st.when) { render(); return; }
    const when = readWhen(); if (!when.date) return;
    st.planets = planetsFor(when);
    if (!st.ids.length) { st.result = null; st.when = when; render(); showFallback(null, when); return; }
    const r = S.solve({
      W: st.W, H: st.H, jd: when.jd != null ? when.jd : null, jdDate: when.jdDate, ids: st.ids, detections: st.dets, planets: st.planets,
      excluded: st.excluded, horizon: st.horizon, verticals: st.verticals, horizonType: $("htype").value, seaHeight: Number($("hgt").value) || 0,
      timeSigmaSec: when.acc, tapSigmaPx: 1.2, f35: st.f35
    });
    if (r.ok) applyLearnedAccuracy(r);
    st.result = r.ok ? r : null; st.when = when;
    render();
    if (r.ok && r.lat != null && r.lon != null) showResult(r, when);
    else if (r.ok && r.lat != null && (when.jd == null)) showResult(r, when);
    else showFallback(r.ok ? r : null, when);
  }
  // trained accuracy model: replace the solver's hand-calibrated ± with one learned from simulated photos
  function applyLearnedAccuracy(r) {
    const A = MODELS.accuracy; if (!A || !ML || !r.features || r.lat == null) return;
    const x = ML.accuracyFeatures(r.features);
    const sig = m => Math.exp(ML.gbtPredict(m, x) + A.euler) * m.scale;
    const sN = sig(A.north_south), kN = sN / r.sigLatKm;
    r.sigLatKm = sN; r.sigLatDeg = sN / 111.2;
    let kE = kN;
    if (r.lon != null) { const sE = sig(A.east_west); kE = sE / r.sigLonKm; r.sigLonKm = sE; r.sigLonDeg = sE / (111.32 * Math.max(0.02, Math.cos(r.lat * D2R))); }
    if (r.covKm) r.covKm = [[r.covKm[0][0] * kE * kE, r.covKm[0][1] * kE * kN], [r.covKm[1][0] * kE * kN, r.covKm[1][1] * kN * kN]];
    if (r.budget) { const k = (kN + kE) / 2; r.budget = { horizonKm: r.budget.horizonKm * k, restKm: r.budget.restKm * k, timeKm: r.budget.timeKm * kE }; }
    r.learnedSigma = true;
  }

  $("when").addEventListener("submit", e => {
    e.preventDefault();
    if (!$("d").value) { setStatus("Add the date the photo was taken.", "err"); $("d").focus(); return; }
    st.when = readWhen();
    runSolve();
    const r = st.result;
    if (r && r.lat == null) setStatus("The sky is measured. Now mark the horizon (or vertical edges) on the photo so the page knows which way is up.");
    else setStatus("");
    $("fix").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });

  // ---------------- results ----------------
  function quality(km) { return km < 3 ? ["Pinpoint", "good"] : km < 15 ? ["Precise", "good"] : km < 60 ? ["Regional", "mid"] : ["Rough", ""]; }
  function placeLine(lat, lon) {
    const near = PL.nearest(lat, lon, 3), p = near[0];
    if (p.km < 4) return { head: p.name + ", " + p.country, sub: "Within a few km of " + p.name };
    return { head: (p.km > 400 ? "Remote area · " : "") + Math.round(p.km) + " km " + p.dir + " of " + p.name + ", " + p.country, sub: "Also " + near.slice(1).map(q => Math.round(q.km) + " km " + q.dir + " of " + q.name).join(" · ") };
  }
  function showResult(r, when) {
    $("fix").hidden = false;
    const tags = $("tags"), place = $("place"), coords = $("coords"), links = $("links"), note = $("note"), tip = $("tip");
    tags.replaceChildren(); place.replaceChildren(); coords.replaceChildren(); links.replaceChildren(); note.hidden = true; tip.hidden = true;
    let lat = null, lon = null, sN = null, sE = null, mode = "none";
    if (!r.ok) { note.hidden = false; note.textContent = r.reason === "few_stars" ? "Fewer than 3 stars could be used, so the sky can't be measured. Try a photo with more clear sky." : "The star fit didn't converge. Try a different photo."; }
    else if (r.lat == null) { mode = "none"; note.hidden = false; note.textContent = "The stars are measured, but the page still needs to know which way is up. Mark at least 2 points on the horizon, or trace 2 vertical edges, on the photo above."; }
    else if (r.lon == null) { mode = "lat"; lat = r.lat; sN = r.sigLatKm; note.hidden = false; note.textContent = "Latitude is measured. Add the local time and its time zone to get longitude: the sky turns 15° an hour, so time is what fixes east–west position."; }
    else { mode = "full"; lat = r.lat; lon = r.lon; sN = r.sigLatKm; sE = r.sigLonKm; }

    if (mode === "none") { tags.append(el("span", "tag", "Waiting for the horizon")); place.append(document.createTextNode(r.ok ? "Stars measured" : "No fix yet")); }
    else {
      const worst = Math.max(sN, sE == null ? 0 : sE);
      if (mode === "full") { const [q, c] = quality(worst); tags.append(el("span", "tag " + c, q)); } else tags.append(el("span", "tag mid", "Latitude only"));
      tags.append(el("span", "tag good", "Measured from " + r.nUsed + " stars"));
      if (r.learnedSigma) tags.append(el("span", "tag good", "± from trained model"));
      if (r.joint && Math.abs(r.joint.hoffDeg) > 2 * r.joint.hoffSigDeg && st.horizon.length) tags.append(el("span", "tag mid", "Terrain-corrected"));
      if (mode === "full") { const pl = placeLine(lat, lon); place.append(document.createTextNode(pl.head)); place.append(el("small", null, pl.sub)); }
      else { place.append(document.createTextNode("Somewhere along " + fmtLat(lat).replace(/(\.\d)\d+/, "$1"))); place.append(el("small", null, "Every point on this line of latitude matches the sky")); }
      coords.append(el("span", null, mode === "full" ? fmtLat(lat) + ", " + fmtLon(lon) : fmtLat(lat)));
      coords.append(el("span", "pm", "± " + fmtKm(sN) + " N–S" + (sE != null ? " · ± " + fmtKm(sE) + " E–W" : "")));
      const b = r.budget || {};
      const parts = [
        ["horizon", b.horizonKm || 0, `uncertainty about the terrain on the horizon (about ${fmtKm(b.horizonKm || 0)}). A sea horizon or flat plain gives the sharpest fix; low stars near the horizon also help the page tell where true level is.`],
        ["rest", b.restKm || 0, st.horizon.length
          ? `the marks and the star fit (about ${fmtKm(b.restKm || 0)}). Add horizon points across the full width of the photo, and use a sharp, unedited original with more stars.`
          : `the vertical edges and the star fit (about ${fmtKm(b.restKm || 0)}). Tall vertical edges spread across the width of the photo, or a visible horizon, tighten it a lot.`],
        ["time", mode === "full" ? (b.timeKm || 0) : 0, `clock uncertainty (${$("acc").selectedOptions[0].text.toLowerCase()} ≈ ${fmtKm(b.timeKm || 0)} east–west). Use the exact time from the original photo file, or check the camera clock against a phone.`]
      ].sort((a, c) => c[1] - a[1]);
      if (parts[0][1] > 1) { tip.hidden = false; tip.replaceChildren(el("b", null, "Biggest error source: "), document.createTextNode(parts[0][2])); }
    }
    if (lat != null && lon != null) {
      const q = lat.toFixed(5) + "," + lon.toFixed(5);
      const a1 = el("a", null, "Open in Google Maps ↗"); a1.href = "https://www.google.com/maps/search/?api=1&query=" + q; a1.target = "_blank"; a1.rel = "noopener";
      const a2 = el("a", null, "OpenStreetMap ↗"); a2.href = `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=11/${lat.toFixed(5)}/${lon.toFixed(5)}`; a2.target = "_blank"; a2.rel = "noopener";
      const cp = el("button", null, "Copy coordinates"); cp.type = "button";
      cp.addEventListener("click", () => {
        const txt = lat.toFixed(5) + ", " + lon.toFixed(5);
        const fallback = () => { const r0 = document.createRange(); r0.selectNodeContents(coords.firstChild); const s0 = getSelection(); s0.removeAllRanges(); s0.addRange(r0); };
        try { navigator.clipboard.writeText(txt).then(() => { cp.textContent = "Copied"; setTimeout(() => cp.textContent = "Copy coordinates", 1500); }, fallback); } catch (_) { fallback(); }
      });
      links.append(a1, a2, cp);
    }
    // stats
    const stats = $("stats"); stats.replaceChildren();
    const stat = (k, v, cls) => { const d = el("div", "stat"); d.append(el("dt", null, k), el("dd", cls, v)); stats.append(d); };
    if (r.ok) {
      const auto = r.matches.filter(m => m.source === "auto" && m.used).length;
      stat("Stars used", String(r.nUsed) + (auto ? ` (${auto} auto)` : ""));
      stat("Fit error", r.rmsArcmin.toFixed(1) + "′", r.rmsArcmin < 2 ? "g" : r.rmsArcmin < 6 ? "m" : "b");
      stat("Field of view", Math.round(r.fov.h) + "° × " + Math.round(r.fov.v) + "°");
      const cue = [st.horizon.length ? st.horizon.length + " horizon pts" : "", st.verticals.length ? st.verticals.length + " verticals" : ""].filter(Boolean).join(" · ");
      stat("Level from", cue || "Not marked", cue ? "" : "b");
      if (r.joint && st.horizon.length) stat("Horizon above true level", (r.joint.hoffDeg >= 0 ? "+" : "−") + Math.abs(r.joint.hoffDeg).toFixed(2) + "° ± " + r.joint.hoffSigDeg.toFixed(2) + "°");
      if (r.pointing && r.lat != null) stat("Camera aimed", Math.round(r.pointing.az) + "° az, " + Math.round(r.pointing.alt) + "° up");
    }
    stat("Taken", when.date + (when.time ? " " + when.time : "") + (when.tz != null ? " " + offLabel(when.tz) : ""));
    if (st.meta.gps && mode === "full") { const err = S.haversineKm(st.meta.gps.lat, st.meta.gps.lon, lat, lon); stat("Off from GPS", fmtKm(err), err < 15 ? "g" : err < 80 ? "m" : "b"); }
    // star table
    const tb = $("starRows"); tb.replaceChildren(); $("starSec").hidden = !r.ok;
    if (r.ok) {
      const conOf = name => { const c = S.BY_NAME.get(name.toLowerCase()); return c ? (P.CON[c.con] || c.con) : (st.planets.find(p => p.name === name) ? "Planet" : ""); };
      const rows = r.matches.slice().sort((a, b) => (b.used - a.used) || (a.source === "auto") - (b.source === "auto") || a.mag - b.mag);
      for (const m of rows) {
        const tr = el("tr", m.used ? "" : "off");
        tr.append(el("td", null, m.name), el("td", null, conOf(m.name)));
        const sc = el("td"); sc.append(el("span", "src " + (m.source === "auto" ? "auto" : "claude"), m.source === "auto" ? "Auto-matched" : "Pattern")); tr.append(sc);
        tr.append(el("td", "num", m.mag.toFixed(1)), el("td", "num", isFinite(m.resArcmin) ? m.resArcmin.toFixed(1) + "′" : "—"));
        const td = el("td"); const cb = el("input"); cb.type = "checkbox"; cb.checked = !m.manualOff; cb.setAttribute("aria-label", "Use " + m.name);
        cb.title = m.manualOff ? "Excluded by you" : m.used ? "Used in the fix" : "Rejected automatically: doesn't fit the others";
        cb.addEventListener("change", () => { if (cb.checked) st.excluded.delete(m.key); else st.excluded.add(m.key); scheduleSolve(); });
        td.append(cb); if (!m.used && !m.manualOff) td.append(document.createTextNode(" rejected")); tr.append(td); tb.append(tr);
      }
    }
    // clues
    const list = (id, items) => { const ul = $(id); ul.replaceChildren(); items.forEach(it => { const li = el("li"); li.append(el("b", null, it.name)); if (it.note) li.append(el("span", null, it.note)); ul.append(li); }); };
    const sky = [];
    if (st.recog && st.recog.ok) sky.push({ name: st.recog.constellations.slice(0, 5).join(", "), note: "Constellations recognised from the star pattern" });
    if (st.planets.length) sky.push({ name: st.planets.map(p => p.name).join(", "), note: "Bright planets that night, added to the catalog" });
    if (r.ok) sky.push({ name: r.matches.filter(m => m.used).length + " stars fit to " + r.rmsArcmin.toFixed(1) + "′", note: "Average gap between each star and where the fitted camera puts it" });
    list("skyClues", sky.length ? sky : [{ name: "No stars recognised yet" }]);
    const camL = [];
    if (r.ok) {
      const f35 = r.cam.f / Math.hypot(st.W, st.H) * 43.27;
      camL.push({ name: Math.round(f35) + " mm equivalent lens", note: "Focal length solved from the stars" + (st.f35 ? ` (photo file says ${st.f35} mm)` : "") });
      camL.push({ name: "Lens distortion " + (r.cam.k1 * 100).toFixed(1) + "%", note: "Barrel or pincushion bend solved from the stars" });
      if (r.joint && st.horizon.length) camL.push({ name: "Terrain " + (r.joint.hoffDeg >= 0 ? "+" : "−") + Math.abs(r.joint.hoffDeg).toFixed(2) + "° above true level", note: "Solved jointly from the horizon marks and the refraction of low stars" });
    }
    list("groundClues", camL.length ? camL : [{ name: "Waiting for a fix" }]);
    st.view = { lat, lon, sN, sE, mode, r };
    drawCharts(st.view);
  }


  // ---------------- fallbacks: GPS in the file, the Moon, a rough region ----------------
  const SYS_DEG = { sea: 0.05, flat: 0.2, hills: 0.6, mountains: 1.3, trees: 0.9, buildings: 0.7 };
  function showFallback(r, when) {
    const used = [];
    // 1. the photo file's own GPS is the answer
    if (st.meta.gps) {
      renderPoint({ lat: st.meta.gps.lat, lon: st.meta.gps.lon, sKm: 0.05, tags: [["From the photo's GPS tag", "good"]],
        note: r ? "The stars were measured but the page couldn't tell which way is up, so this is the location your camera recorded." : "The star pattern couldn't be recognised, so this is the location your camera recorded in the photo file.", when });
      return;
    }
    const c = { jd: when.jd != null ? when.jd : null };
    if (r && when.jd != null) {
      const catD = S.catalogOfDate(when.jd, st.planets);
      c.starsUp = r.matches.filter(m => m.used).map(m => catD.get(m.key)).filter(Boolean).map(x => x.v);
      c.camR = r.cam.R;
      used.push(`${c.starsUp.length} recognised stars were all above the horizon at that moment`, "the photo was held roughly upright (within about 30°)");
    }
    if (when.tz != null) { c.tzOffset = when.tz; c.tzSigma = 10; used.push("the time zone " + offLabel(when.tz)); }
    // 2. the Moon's height above the horizon
    if (st.moon && when.utc && FB && (st.horizon.length >= 2 || st.verticals.length >= 2)) {
      const f = r ? r.cam.f : (st.f35 ? st.f35 * Math.hypot(st.W, st.H) / 43.27 : null);
      if (f) {
        const mc = FB.moonCircle(st.moon, f, st.W, st.H, { horizon: st.horizon, verticals: st.verticals }, when.utc, 0, st.horizon.length ? SYS_DEG[$("htype").value] : 0.4);
        if (mc) { c.moon = mc; used.push(`the Moon, ${mc.hObs.toFixed(1)}° above the horizon`); }
      }
    }
    if (!c.starsUp && c.tzOffset == null && !c.moon) {
      renderPoint({ none: true, when, note: (st.ids.length ? "The stars are measured, but " : "")
        + "there isn't enough to place this photo yet. Add the local time and time zone" + (st.moon ? ", and mark the horizon so the Moon's height can be measured" : "")
        + (st.ids.length ? ", or mark the horizon or 2 vertical edges for a precise fix." : ".") });
      return;
    }
    const rr = FB.roughRegion(c);
    if (!rr) { renderPoint({ none: true, when, note: "These clues contradict each other (for example the time zone doesn't fit the stars). Check the date, time and time zone." }); return; }
    st.rough = rr;
    const tip = st.ids.length ? "For a precise fix, mark at least 2 horizon points or trace 2 vertical edges (building corners, window sides, poles) on the photo." : (st.moon && !(st.horizon.length || st.verticals.length) ? "Mark the horizon or 2 vertical edges so the Moon's height can be measured." : "A wider photo with more bright stars lets the page recognise the sky and measure your position precisely.");
    renderPoint({ lat: rr.lat, lon: rr.lon, sKm: rr.spreadKm, rough: rr, when, tags: [["Rough region", "mid"]],
      note: "No precise star fix, so this combines what's left: " + used.join(" · ") + ". The shaded area on the globe shows where these clues agree.", tip });
  }
  function renderPoint(o) {
    $("fix").hidden = false;
    const tags = $("tags"), place = $("place"), coords = $("coords"), links = $("links"), note = $("note"), tip = $("tip");
    [tags, place, coords, links].forEach(e => e.replaceChildren()); note.hidden = !o.note; note.textContent = o.note || ""; tip.hidden = !o.tip;
    if (o.tip) tip.replaceChildren(el("b", null, "To narrow it down: "), document.createTextNode(o.tip));
    $("starSec").hidden = true;
    const stats = $("stats"); stats.replaceChildren();
    const stat = (k, v, cls) => { const d = el("div", "stat"); d.append(el("dt", null, k), el("dd", cls, v)); stats.append(d); };
    if (o.none) { tags.append(el("span", "tag", "No fix yet")); place.append(document.createTextNode("Not enough to go on")); st.view = { lat: null, lon: null, mode: "none", r: {} }; drawCharts(st.view); return; }
    for (const [t, c] of o.tags) tags.append(el("span", "tag " + c, t));
    if (o.rough && o.sKm > 1500) { place.append(document.createTextNode("Somewhere in the shaded region")); const pl = PL.nearest(o.lat, o.lon, 1)[0]; place.append(el("small", null, `Centre of the region is ${Math.round(pl.km)} km ${pl.dir} of ${pl.name}, ${pl.country}, but the region is very large`)); }
    else { const pl = placeLine(o.lat, o.lon); place.append(document.createTextNode((o.rough ? "Roughly " : "") + pl.head)); place.append(el("small", null, pl.sub)); }
    coords.append(el("span", null, fmtLat(o.lat) + ", " + fmtLon(o.lon)), el("span", "pm", "± " + fmtKm(o.sKm) + (o.rough ? " (spread of the region)" : "")));
    const q = o.lat.toFixed(5) + "," + o.lon.toFixed(5);
    const a1 = el("a", null, "Open in Google Maps ↗"); a1.href = "https://www.google.com/maps/search/?api=1&query=" + q; a1.target = "_blank"; a1.rel = "noopener";
    links.append(a1);
    if (o.rough) { stat("Region holding 90%", fmtKm(Math.sqrt(o.rough.area90)) + " across"); }
    if (st.recog && st.recog.ok) stat("Stars recognised", String(st.ids.length));
    if (st.moon) stat("Moon in photo", "Yes");
    stat("Taken", o.when.date + (o.when.time ? " " + o.when.time : "") + (o.when.tz != null ? " " + offLabel(o.when.tz) : ""));
    const sky = [];
    if (st.recog && st.recog.ok) sky.push({ name: st.recog.constellations.slice(0, 5).join(", "), note: "Constellations recognised from the star pattern" });
    if (st.moon) sky.push({ name: "The Moon", note: "Found in the sky" });
    const ul = $("skyClues"); ul.replaceChildren(); (sky.length ? sky : [{ name: "No stars recognised" }]).forEach(it => { const li = el("li"); li.append(el("b", null, it.name)); if (it.note) li.append(el("span", null, it.note)); ul.append(li); });
    const gl = $("groundClues"); gl.replaceChildren(); const li = el("li"); li.append(el("b", null, st.horizon.length ? st.horizon.length + " horizon points" : st.verticals.length ? st.verticals.length + " vertical edges" : "No horizon or vertical edges"), el("span", null, "What tells the page which way is up")); gl.append(li);
    st.view = { lat: o.lat, lon: o.lon, sN: o.sKm, sE: o.sKm, mode: o.rough ? "rough" : "full", r: { covKm: [[o.sKm * o.sKm, 0], [0, o.sKm * o.sKm]] }, region: o.rough };
    drawCharts(st.view);
  }

  // ---------------- charts ----------------
  function drawCharts(v) { drawZoom(v); drawWorld(v); }
  function eig2(C) { const a = C[0][0], b = C[0][1], d = C[1][1]; const tr = (a + d) / 2, df = Math.sqrt(((a - d) / 2) ** 2 + b * b); return { l1: tr + df, l2: Math.max(0, tr - df), ang: 0.5 * Math.atan2(2 * b, a - d) }; }
  function drawZoom(v) {
    const c = $("zoom"), g = c.getContext("2d"), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const leg = $("zoomLegend"); leg.replaceChildren();
    if (v.lat == null || v.lon == null) { g.fillStyle = css("--dim"); g.font = "28px " + css("--f-body"); g.textAlign = "center"; g.fillText(v.lat != null ? "Longitude needs the time and time zone" : "Mark the horizon to calculate a fix", W / 2, H / 2); g.textAlign = "left"; return; }
    const r = v.r, cosL = Math.cos(v.lat * D2R), sig = Math.max(v.sN, v.sE);
    const others = [];
    if (st.meta.gps) others.push({ lat: st.meta.gps.lat, lon: st.meta.gps.lon, col: css("--ok"), label: "GPS in photo" });
    for (const p of PL.nearest(v.lat, v.lon, 6)) others.push({ lat: p.lat, lon: p.lon, col: css("--dim"), label: p.name, town: true });
    let halfKm = Math.max(12, 3.2 * sig);
    for (const o of others) if (!o.town) { const dk = S.haversineKm(v.lat, v.lon, o.lat, o.lon); if (dk < 6 * halfKm) halfKm = Math.max(halfKm, dk * 1.25); }
    const pxPerKm = Math.min(W, H) / 2 / halfKm, cx = W / 2, cy = H / 2;
    const toPx = (la, lo) => [cx + ((lo - v.lon + 540) % 360 - 180) * 111.32 * cosL * pxPerKm, cy - (la - v.lat) * 111.2 * pxPerKm];
    const spanDeg = (W / pxPerKm) / 111.2;
    const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20].find(s => spanDeg / s <= 8) || 30;
    const mono = css("--f-mono");
    g.strokeStyle = css("--rule"); g.fillStyle = css("--dim"); g.lineWidth = 1; g.font = "20px " + mono;
    const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    for (let la = Math.ceil((v.lat - spanDeg) / step) * step; la <= v.lat + spanDeg; la += step) { const y = toPx(la, v.lon)[1]; if (y < 0 || y > H) continue; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText(Math.abs(la).toFixed(dec) + "°" + (la >= 0 ? "N" : "S"), 10, y - 6); }
    const spanLon = spanDeg / Math.max(0.05, cosL);
    for (let lo = Math.ceil((v.lon - spanLon) / step) * step; lo <= v.lon + spanLon; lo += step) { const x = toPx(v.lat, lo)[0]; if (x < 0 || x > W) continue; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); const lw = ((lo + 540) % 360) - 180; g.fillText(Math.abs(lw).toFixed(dec) + "°" + (lw >= 0 ? "E" : "W"), x + 6, H - 10); }
    if (r.covKm) {
      const e = eig2(r.covKm);
      [[2, .10], [1, .22]].forEach(([n, a]) => {
        g.save(); g.translate(cx, cy); g.rotate(-e.ang); g.beginPath();
        g.ellipse(0, 0, Math.max(2, n * Math.sqrt(e.l1) * pxPerKm), Math.max(2, n * Math.sqrt(e.l2) * pxPerKm), 0, 0, Math.PI * 2);
        g.fillStyle = css("--redlight"); g.globalAlpha = a; g.fill(); g.globalAlpha = .9; g.strokeStyle = css("--redlight"); g.lineWidth = 2; g.setLineDash(n === 2 ? [8, 6] : []); g.stroke(); g.restore();
      });
    }
    let townShown = false;
    for (const o of others) {
      const [x, y] = toPx(o.lat, o.lon), inView = x > 0 && x < W && y > 0 && y < H;
      if (o.town) {
        if (!inView) continue; townShown = true;
        g.fillStyle = css("--dim"); g.fillRect(x - 5, y - 5, 10, 10); g.font = "20px " + css("--f-body"); g.fillText(o.label, x + 10, y + 6); continue;
      }
      if (inView) { g.fillStyle = o.col; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); g.strokeStyle = css("--sky"); g.lineWidth = 3; g.stroke(); }
      const li = el("span"); const i = el("i"); i.style.background = o.col; li.append(i, document.createTextNode(o.label + (inView ? "" : " (off this view, " + fmtKm(S.haversineKm(v.lat, v.lon, o.lat, o.lon)) + " away)"))); leg.append(li);
    }
    g.fillStyle = css("--star"); g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill(); g.strokeStyle = css("--sky"); g.lineWidth = 3; g.setLineDash([]); g.stroke();
    const l0 = el("span"); const i0 = el("i"); i0.style.background = css("--star"); l0.append(i0, document.createTextNode("Star fix")); leg.prepend(l0);
    const l1 = el("span"); const i1 = el("i"); i1.style.background = css("--redsoft"); i1.style.border = "1px solid " + css("--redlight"); l1.append(i1, document.createTextNode("1σ and 2σ uncertainty")); leg.insertBefore(l1, leg.children[1] || null);
    if (townShown) { const lt = el("span"); const it = el("i"); it.style.background = css("--dim"); it.style.borderRadius = "2px"; lt.append(it, document.createTextNode("Reference places")); leg.append(lt); }
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].find(k => k * pxPerKm > W * 0.15) || 5000;
    const bx = W - 30 - nice * pxPerKm, by = 34;
    g.strokeStyle = css("--ink"); g.lineWidth = 3; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + nice * pxPerKm, by); g.stroke();
    g.fillStyle = css("--ink"); g.font = "20px " + mono; g.textAlign = "right"; g.fillText(nice + " km", W - 30, by + 26); g.textAlign = "left";
  }
  function drawWorld(v) {
    const c = $("world"), g = c.getContext("2d"), W = c.width, H = c.height;
    const x = lon => (lon + 180) / 360 * W, y = lat => (90 - lat) / 180 * H;
    g.clearRect(0, 0, W, H);
    // reference places as a faint dot map of the inhabited world
    g.fillStyle = css("--rule"); for (const p of PL.PLACES) { g.beginPath(); g.arc(x(p.lon), y(p.lat), 3, 0, Math.PI * 2); g.fill(); }
    g.lineWidth = 1; g.strokeStyle = css("--rule"); g.fillStyle = css("--dim"); g.font = "22px " + css("--f-mono");
    for (let lat = -60; lat <= 60; lat += 30) { g.beginPath(); g.moveTo(0, y(lat)); g.lineTo(W, y(lat)); g.stroke(); g.fillText(lat === 0 ? "0°" : Math.abs(lat) + "°" + (lat > 0 ? "N" : "S"), 12, y(lat) - 8); }
    for (let lon = -150; lon <= 150; lon += 30) { g.beginPath(); g.moveTo(x(lon), 0); g.lineTo(x(lon), H); g.stroke(); }
    g.fillText("180°W", 12, H - 12); g.textAlign = "right"; g.fillText("180°E", W - 12, H - 12); g.textAlign = "center"; g.fillText("0°", x(0), H - 12); g.textAlign = "left";
    if (v.region) {
      let mx = 0; for (const p of v.region.cells) if (p.w > mx) mx = p.w;
      const cw = W / 360 + 0.6, ch = H / 180 + 0.6;
      g.fillStyle = css("--redlight");
      for (const p of v.region.cells) { const a = p.w / mx; if (a < 0.02) continue; g.globalAlpha = 0.12 + 0.6 * a; g.fillRect(x(p.lon - 0.5), y(p.lat + 0.5), cw, ch); }
      g.globalAlpha = 1;
    }
    if (v.lat == null) return;
    if (v.lon == null) {
      const sd = Math.max(0.4, (v.sN || 50) / 111.2);
      g.fillStyle = css("--redsoft"); g.fillRect(0, y(v.lat + sd), W, Math.max(3, y(v.lat - sd) - y(v.lat + sd)));
      g.strokeStyle = css("--redlight"); g.beginPath(); g.moveTo(0, y(v.lat)); g.lineTo(W, y(v.lat)); g.stroke(); return;
    }
    if (st.meta.gps) { g.fillStyle = css("--ok"); g.beginPath(); g.arc(x(st.meta.gps.lon), y(st.meta.gps.lat), 8, 0, Math.PI * 2); g.fill(); }
    const px = x(v.lon), py = y(v.lat);
    g.strokeStyle = css("--star"); g.lineWidth = 2; g.beginPath(); g.moveTo(px - 22, py); g.lineTo(px - 10, py); g.moveTo(px + 10, py); g.lineTo(px + 22, py); g.moveTo(px, py - 22); g.lineTo(px, py - 10); g.moveTo(px, py + 10); g.lineTo(px, py + 22); g.stroke();
    g.fillStyle = css("--star"); g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
  }
})();
