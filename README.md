# Starfix

Find where a night-sky photo was taken, from the photo and the time it was taken. Starfix recognises the stars, works out which way is up from the horizon or from vertical edges on buildings, and turns that into latitude and longitude with an honest error estimate. The website runs entirely in the visitor's browser: no server, no accounts, and photos never leave the device.

## Quick start

```
python serve.py
```

This opens http://localhost:8000 (the site itself needs only plain Python; the training scripts need `pip install -r requirements.txt`). Drop in a night-sky photo, check the date, time and time zone, and press **Find location**. The original JPEG from your phone works best, because it carries the exact time, time zone and lens.

Two test photos are in `site/test-photos`. The file names give the date, local time and UTC offset to enter.

## Folder layout

```
site/                       the website: upload this folder to any static host
  index.html                page layout and styles
  app.js                    interface: photo loading, EXIF, marking, results, charts
  solver.js                 navigation maths: 230-star catalog, precession, aberration, refraction,
                            star finding, camera fit, edge consensus, joint sky-ground adjustment
  platesolve.js             star-pattern recogniser, sky mask, trail filter, automatic horizon
                            and vertical-edge finders
  fallback.js               rough answers when there's no precise fix (the Moon, a rough region)
  ml.js                     runs the trained models in the browser (twin of model/starfix_ml.py)
  cities.js                 544 reference places for "X km NNE of ..."
  models/
    star_detector.json      trained neural network (235 KB)
    accuracy_model.json     trained gradient-boosted trees (285 KB)
  test-photos/              a real photo (Champaign, Illinois) and a simulated one (Grand Canyon)
model/                      Python: training and command-line tools
  starfix_ml.py             shared features and model inference
  train_star_detector.py    trains the star detector
  train_accuracy_model.py   trains the accuracy model
  detect_stars.py           runs the star detector on any photo
  data/accuracy_trials.csv  40,000 simulated photos used to train the accuracy model
  reports/                  test results from the last training runs
tools/
  simulate_accuracy.js      makes the accuracy training data (needs Node.js)
experiments/                scripts and results behind every number in the paper
serve.py                    local preview server
```

## How it locates a photo

1. **Find the sky.** A sky mask keeps only the dark, smooth part of the photo. Lit buildings, roofs and trees otherwise produce hundreds of false stars.
2. **Find the stars.** A small blur (a matched filter) brings faint stars above the noise. Every point of light is measured to about 0.1 px, the trained detector removes junk, and a geometric filter removes satellite and aircraft trails (8 or more points on one straight line).
3. **Recognise the pattern.** Triangles of bright stars are matched by shape against an index of catalog triangles, over a range of lens focal lengths (or the photo's own, from EXIF). Each candidate is checked against the whole field and scored by how unlikely that many matches would be by chance.
4. **Fit the camera.** Pointing, focal length and lens distortion are solved by least squares. Misfits are rejected and fainter catalog stars are matched automatically.
5. **Find straight up.** From the horizon (found automatically, adjustable), or, with no horizon, from vertical edges on buildings and poles: once the stars fix the camera, every truly vertical edge must point at the zenith. A consensus step throws out edges that aren't truly vertical, such as sloped roofs.
6. **Joint adjustment.** Camera, zenith and the height of the terrain on the horizon are solved together. Atmospheric refraction lifts low stars by a known amount, which gives a second "level" that hills don't fool.
7. **Position and ±.** Where straight up points among the stars at the photo's moment gives latitude and longitude. The trained accuracy model sets the ±.
8. **When there's no precise fix:** the photo file's GPS tag if it has one; otherwise a rough region combining what's left (stars above the horizon, a roughly upright photo, the time zone, the Moon).

## Accuracy

All numbers below come from the scripts in `experiments/` and `tools/`. They are simulations, except the one real photo.

**By where "up" came from** (40,000 simulated photos, clock exact to 2 s):

| Source of "up" | Median error | 90% of fixes within |
|---|---|---|
| Sea horizon | 11 km | 23 km |
| Flat land horizon | 13 km | 27 km |
| Vertical edges on buildings, no horizon | 44 km | 650 km |
| Hills | 65 km | 138 km |
| Mountains | 188 km | 488 km |

**Clock accuracy matters most for longitude.** Four minutes of clock error is one degree. The median error over all photos is 43 km with an exact clock, 53 km with the time known to 2 minutes, 114 km to 10 minutes, and 471 km to an hour.

**Full pipeline on 60 rendered photos** (phone main camera, flat horizon, exact clock, 0–400 hot pixels, 0–3 satellite trails): sky recognised in 60 of 60, median error 1.3 km, 90% within 3.5 km. With the trained detector switched off, only 22 of 60 were recognised.

**Lens:** the pattern is recognised 95–100% of the time with phone lenses (13–26 mm equivalent), 85–90% at 24 mm, about half the time at 35 mm, and 20–35% at 50 mm. Narrow lenses fail because the 230-star catalog leaves too few stars in the frame.

**Real photo:** a phone photo taken in Champaign, Illinois at 1:01 am on 12 Nov 2026, looking 59° up past a lit building, with no horizon and no camera data. Starfix recognised 16 stars in Taurus, Orion and Gemini, found 18 vertical edges on the buildings, and placed the photo **1.6 km** from Champaign, with a stated uncertainty of ±64 km north–south and ±32 km east–west. One photo is a demonstration, not a measure of accuracy.

## The trained models

There is no public collection of night-sky photos labelled with where they were taken, so both models learn from simulated photos built with real star positions and realistic cameras, noise and terrain.

### Star detector (neural network)

Decides whether each point of light is a real star or junk: hot pixels, noise spikes, street lights, plane and satellite trails, bright edges of trees and buildings.

- **Trained on:** 300,000 rendered points of light, half real stars (sharp, blurry, trailed, out of focus, saturated, faint down to signal-to-noise 3) and half junk. Random sensor noise, sky glow and JPEG compression make them look like phone photos.
- **Model:** scikit-learn MLP, 129 inputs, hidden layers of 128 and 64.
- **Held-out results (60,000 examples):** 96.5% accuracy, ROC AUC 0.995. Real stars kept 96.3%; hot pixels rejected 96.9%, noise 99.4%, ground lights 94.3%, trails 97.1%, edges 98.2%.
- **Retrain:** `python model/train_star_detector.py` (about 12 minutes on a 2-core machine). `--n 60000` takes about 2 minutes and is less accurate.

### Accuracy model (gradient-boosted trees)

Turns the solver's own diagnostics into the ± shown on the site, learned from how wrong the solver actually was on simulated photos.

- **Trained on:** 40,000 simulated photos run through the real solver, with random places, times, cameras (13–35 mm, tilted 10–80° up), atmosphere, horizons of six types with realistic terrain, or 2–20 vertical edges (15% of them not truly vertical), and clock errors.
- **Model:** two scikit-learn gradient-boosted regressors (north–south and east–west), 400 trees each, calibrated so about 93% of fixes fall inside the 2-sigma ellipse.
- **Held-out results (8,000 photos):** the true location falls inside 2 sigma 93.2% (N–S) and 93.4% (E–W) of the time, and the ± ranks good and bad fixes better than the hand-tuned alternative (rank correlation 0.75 vs 0.70 N–S, 0.76 vs 0.72 E–W).
- **Retrain:** `node tools/simulate_accuracy.js --n 40000 --out model/data/accuracy_trials.csv` (about 2 minutes), then `python model/train_accuracy_model.py` (about 1 minute). The data set is included, so you can retrain without Node.

Both training scripts write straight into `site/models/`, so the website uses the new model on the next page load.

## Try the detector from the command line

```
python model/detect_stars.py path/to/photo.jpg
```

Saves `photo_stars.png` with green circles on stars and red crosses on everything rejected.

## Reproduce the experiments

Each script prints how to run it at the top. They need Node.js; `exp_detector.js` also needs Playwright and the site served locally.

| Script | What it measures |
|---|---|
| `experiments/exp_recognition.js` | Star-pattern recognition by lens, with and without the focal length |
| `experiments/exp_ablations.js` | Joint fit vs a level horizon; edge consensus vs using every edge |
| `experiments/make_scenes.js` + `render_scenes.py` + `exp_detector.js` | Full pipeline on rendered photos, detector on and off |

Results are saved in `experiments/results/`.

## Put it online

Upload the **site** folder (only that folder) to any static host:

- **Netlify:** drag the `site` folder onto app.netlify.com/drop.
- **GitHub Pages:** push the repository, then Settings → Pages → deploy from the branch, folder `/site`.
- **Vercel / Cloudflare Pages:** set the output directory to `site`.

Visitors just open the link. The browser downloads the page and the two model files (about 520 KB) and does all the work on the visitor's device. Anything a browser downloads can be saved by the visitor, including the model files.

## Limits

- Needs the capture time and its UTC offset for longitude.
- Needs either a visible horizon or at least three truly vertical edges for a precise fix.
- Narrow lenses (35 mm and up) often show too few catalog stars to recognise.
- Accuracy figures are from simulation; the method has been tried on one real photo so far.
