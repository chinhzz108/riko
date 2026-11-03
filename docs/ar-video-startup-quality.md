# AR playback and recognition audit — 3 November 2026

This change addresses soft/translucent video and the delay between recognition
and visible playback on both mobile browser paths. Measurements below use the
Windows in-app Chromium browser and local HTTP, not physical iOS/Android devices.

## Causes and changes

- The previous outputs reduced most 1280×720 sources to 960×540, and the WebGL
  stage capped device pixel ratio at 1.5. Native v3 preserves original RGB
  dimensions for 20 animals/vehicles and four effects (bus: 960×960). The renderer
  honors phone Retina resolution, bounded to a 4.2-million-pixel drawing buffer.
- Two independently decoded color/matte videos could drift, producing moving
  translucent edges. Both browser families now prefer one H.264 packed texture
  containing color and matte on the same frame clock. UV clamping prevents
  interpolation across the join. An older packed source remains a decode fallback.
- The initial render waited for a compositor callback even when a decoded frame
  already existed. Hidden video elements can delay that callback. Startup now
  waits for decoded data, bounds a stalled `play()` promise, and renders at once.
  If callbacks stop during playback, a watchdog switches to 24 fps media-clock
  updates and explicitly refreshes the texture, avoiding a frozen hidden video.
- Recognition used 700 ms intervals and three consecutive results, with the
  stability key including the model class. Alternating page/popup classes could
  repeatedly restart that count even when both mapped to the same video. The
  interval is now 250 ms; two strong results or three ordinary results confirm,
  keyed by video rather than class name.
- The manifest request no longer blocks playback. It starts when scanning starts;
  bundled profiles can immediately resolve current media. The first candidate
  starts preloading on the same video element used for playback.
- A compiled detector stays idle in memory while the clip plays, so X does not
  require recompiling it. Exiting the scanner disposes the detector. QR work and
  MindAR processing pause during playback.
- A popup at confidence ≥ 0.5 takes priority over the page or QR underneath it.
  Weak conflicting popup results cannot override a stronger visual page candidate.
  Loading/buffering feedback now explains the interval before the video appears.

## Actual detector evaluation

The current runtime model is the Kaggle export **mobile-popup-v3**. It is a YOLO11n
model with 89 classes, NHWC input `[1,320,320,3]`, and the float16 TFLite export
selected from validation. The browser loads it with `?v=popup-v3` so phones do not
reuse the older cached weights.

Training ran for 100 epochs on a Tesla T4 using the movable-popup dataset:

- train 1,446; validation 344; held-out test 360;
- detached-popup/mobile test 280; negative backgrounds 48;
- PyTorch validation mAP50 0.937 and mAP50–95 0.763;
- delivered model SHA256 `cfc9d82f78dc0c627f933c5c95acc1124de2cf63fb241f6341890ab3a96be53f`;
- delivered model size 5,408,554 bytes.

The held-out TFLite results after choosing float16 are:

| Split | Correct video | Wrong video | Popup boxes IoU ≥ 0.5 |
| --- | ---: | ---: | ---: |
| 280 detached/mobile images | 269/280 (96.1%) | 9 | 265/280 |
| 360 held-out book images | 329/360 (91.4%) | 15 | 269/288 |
| 48 negative backgrounds | 46/48 clean | 2 | — |

The actual browser worker reproduced 269/280 detached images, 328/360 full held-out
images, 1/48 false opens on the negative set, and 0/6 false opens on its smoke
negatives. Its browser warm median was
about 76–81 ms after a cold startup of about 3.1–3.3 seconds in this desktop
Chromium environment. The test page and raw results are
`docs/qa/ar-detector-browser-v3.json` and `docs/qa/ar-detector-browser-full-v3.json`.

The scanner now treats a confident popup as independent from the page underneath,
requires two strong or three ordinary observations, tolerates one missed frame,
and waits for a detector sample from the current scene before committing the QR or
MindAR page fallback. The model worker is warmed when the scan route mounts and
stays compiled while the clip is playing. The extra wait is capped at four seconds
and ends immediately on a detector error. This fixes the cold-start race
where the page video appeared first and locked out the detached popup.

The dataset is made from source-art transforms and region copy-paste, not raised
paper camera photographs. Popup patches include some printed scenery and physical
lighting, blur, perspective and occlusion are not fully represented. The numbers
therefore measure this held-out synthetic set; they do not establish 100% recognition
on every phone or book condition. The v2 report remains in
`docs/qa/ar-detector-v2.json` as the baseline comparison.

Raw model proof, class order and Kaggle notebook link: `docs/qa/ar-detector-v3.json`.
The notebook's version #1 was saved successfully with outputs, and the interactive
GPU session was stopped after the downloaded model was verified locally. Float16
is larger than the former INT8 file, and its measured browser inference takes
longer than the earlier v2 batch; the 250 ms sampling interval still exceeds the
76–81 ms warm median. Accuracy and first-open preparation are the reasons for this
selection, not a claim that the new model itself runs faster on every browser.

## Playback measurements

The real MindAR 1.2.5 tracker recognized page images in a synthetic 640×480
camera, while the app, media decode and Three.js rendering ran unchanged.
LiteRT was simulated in this tracker-specific fixture; it is separately evaluated
above and in the model-specific camera fixture.

| Path | Recognition → first stage render |
| --- | --- |
| GT01 native-resolution packed 2560×720 | 382.7 ms |
| X, then GT02 packed 1920×960 | 80.8 ms |
| X, then HTTN05 original opaque 1280×720 | 50.5 ms |
| Actual LiteRT camera / GT01 after candidate preload | 90.9 ms |
| Same LiteRT worker, X then GT02 | 7.7 ms |
| New popup-v3 model / detached GT01 over another page | 113.4 ms |
| Simulated 3.5 s cold model / background QR and tracked page conflict | 38.4 ms |

Covering/shaking after GT01 recognition left tracker/model/QR counters unchanged,
kept the camera live and advanced video frames with zero reported drops in the
held sample. X resumed recognition; zoom/reset and switching to another page
worked. Camera stop ended the track. Raw snapshots are recorded in
`docs/qa/ar-startup-mindar-v3.json`.

The earlier v2 actual-model camera test used a simulated tracker with its page anchors
disabled. LiteRT recognized the camera image, preloaded the candidate and opened
the clip after three results. The same idle detector worker was reused for the
next page; stopping the camera disposed it. See `docs/qa/ar-startup-model-v3.json`.

The compatibility fixture deliberately rejected native-v3 decoding and suppressed
all video-frame callbacks. The app selected the retained 1920×540 packed GT01 and
continued advancing/rendering through the watchdog; first render was 437 ms.
The actual QR decoder opened the correct original MP4, and X resumed scanning
without reopening the same visible QR. Evidence:
`docs/qa/ar-startup-fallback-v3.json` and `docs/qa/ar-startup-qr-v3.json`.

The final popup-v3 camera run opened GT01 from a detached synthetic image over
an unrelated page, then kept tracker/model/QR counts fixed during playback.
X resumed scanning with the same compiled worker; stopping the camera ended the
track and disposed the worker. Raw final snapshots:
`docs/qa/ar-startup-popup-v3.json`. The cold-conflict regression kept the background
QR/page from committing while the model warmed for 3.5 seconds, then selected
GT01 after two strong results: `docs/qa/ar-popup-conflict-v3.json`.

These figures exclude time to recognize the page and are not network/mobile
latency guarantees. The first-frame metric measures the first stage render after
decoded media is ready; it is not an instrumented phone display measurement.

## Quality limits

Native v3 uses source RGB, not enlarged versions of the old small videos. Object
mattes retain the certified v2 edges, resampled to native dimensions; this does
not invent new edge detail. Original motion blur and soft edges remain. The 11
complex nature scenes retain their complete original opaque picture. Snow,
aurora and meteors keep intentional light transparency.

H.264 is not mathematically lossless. CRF 12 is used for animals/vehicles, 14 for
the rainbow, and 18 for light effects to control transfer and decode cost. Media
files remain below the Cloudflare Pages 25 MiB per-file limit. Glows remain large;
fast-start metadata and candidate preloading reduce startup dependence on the
full download, but slow connections can still buffer.

Snow/aurora/meteor files were reduced from 21.31/19.99/9.82 MB to
14.35/11.30/6.40 MB, at the same 1280×720 RGB dimensions.

The builder compares every frame of new object color with the original and every
matte with the certified reference. Reports and hashes are in
`docs/qa/ar-native-packed-v3.json`. Browser QA renders all 45 clips using the app's
shader and checks decode, alpha, opaque colors and frame advancement. Source
comparisons are described in `docs/ar-media-quality.md`.

All 45 final clips passed the browser shader/decode/advancement check; raw results
are in `docs/qa/ar-packed-browser-v3.json`. All 960 decoded effect frames passed
original-source reconstruction checks (`docs/qa/ar-native-effects-v3.json`), with
maximum per-clip mean channel error 0.008963 on a normalized 0–1 scale. This is
image reconstruction error, not a semantic percentage score for matting quality.

## PDF and corner QR locations

- `scripts/ar/stamp_book_qr.py`: `fallback_position()` chooses the corner for
  pages without a printed QR; four constants above it control QR/card sizes.
  `stamp_pdf()` overlays the QR using `page.merge_transformed_page()`.
- `src/data/bookVideoSlots.json`: all 54 PDF page → QR URL → video mappings.
- `public/qr/riko-book-c*-p*.png`: per-page QR images.
- `output/pdf/qr-stamped/Chuong-{1,2,3}-rikokid-me.pdf`: existing stamped PDFs;
  `qr-stamp-audit.json` records placements. Source PDFs are in `tmp/pdfs/source/`.
- `/admin/qr` in `src/app/App.tsx` creates/downloads QR images. PDF stamping is
  handled by the Python script. This audit did not modify the PDFs or QR routes.

The measurements above were captured locally before production deployment.

## Final checks

TypeScript, the production Vite build, scanner/QR routing, gesture math,
presentation, decoded-frame/preload behavior and playback-session regressions all
passed. CI verifies 249 delivered media hashes, the tested model hash and class
order, all 45 final browser results, and the 54 unchanged printed page routes.

The build retains existing warnings for large MindAR/Three.js chunks and Node
compatibility imports in upstream dependencies; no build errors occurred.

![Native-resolution video in the camera fixture](qa/ar-native-startup.jpg)
