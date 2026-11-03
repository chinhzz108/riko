# AR interface and concurrent delivery audit — 3 November 2026

The scanner entry now uses a compact responsive illustration and one primary
camera action. The previous large empty camera placeholder and duplicated
instructions are removed. The live camera uses icon buttons, with no flashlight,
page labels, size percentages or instructional captions. Accessible button names
remain; actionable errors are still shown when playback or camera access fails.

## Where concurrent work happens

- `src/app/ARScan.tsx` obtains camera frames locally. QR decoding and popup
  inference use browser workers. MindAR and Three.js also run on the device.
  Camera frames are not uploaded to an inference service.
- The scanner loads static model, WASM, book targets and media from Cloudflare
  Pages. Active users do not share a central recognition queue. Once video opens,
  recognition pauses; X resumes it using the compiled detector.
- The global application checks the quiz account once on startup. It does not
  put Appwrite requests in the camera processing loop or block AR on authentication.
  This audit does not load-test order, quiz or admin services.

## Bounded production delivery check

`scripts/ar/measure_cdn_capacity.mjs` performs ten simultaneous cold resource
sets (model, primary inference WASM, page targets), followed by fifty simultaneous
1 MiB range requests across six native AR clips. It only reads existing assets.
Raw results before the cache update are in
`qa/ar-cdn-concurrency-2026-11-03.json`.

| Request group | Success | TTFB median / p95 | Full body median / p95 |
| --- | --- | --- | --- |
| 30 cold AR resources, ten sessions | 30/30 | 522 / 1,268 ms | 11,981 / 17,470 ms |
| 50 simultaneous 1 MiB video ranges | 50/50 | 550 / 1,316 ms | 3,950 / 6,221 ms |

All cold sessions completed. All video responses were `206`, all had `CF-Cache-Status:
HIT`, and there were no HTTP 429/5xx responses or network failures. Ten cold sets
share one Windows client's connection; the session completion p95 was 17,960 ms.
This is not the latency of ten independently connected users. Full response-byte
counts are decoded bytes after HTTP decompression, not wire transfer sizes.

This check found no request failure or central AR queue at the tested level.
It does not establish maximum global users, physical phone FPS or a production
service-level guarantee. A weak device, a cold browser or many phones on one
Wi-Fi link can still feel slow.

## Changes to repeated startup traffic

The initial cold download includes a 5.41 MB model, 9.37 MB decoded WASM and
9.69 MB compressed page targets (27.80 MB after decompression), plus JavaScript.
This cost matters on slow connections even if the CDN is healthy.

The model already uses `?v=popup-v3`; it now has a one-year immutable browser
cache rule. LiteRT assets use `/litert/2.5.3/wasm/` with the same cache lifetime.
The copy script validates the installed runtime version and corresponding cache
rule, and retains legacy URLs for already-open older clients. Runtime upgrades
must change the versioned asset path; new models must change their version query.
The video manifest continues to revalidate so it can select current video URLs.
These changes reduce repeated downloads; the first visit still needs the assets.

## Interface and runtime verification

- Responsive layouts checked at 320×568, 390×844, 768×1024 and 1440×900.
  There is no horizontal overflow, and the camera action is visible in the first
  screen on the checked phone sizes.
- Camera and native 2560×720 packed video checked in the browser fixture. The
  actual model ran in a worker with the versioned LiteRT path and opened GT01.
  The first visible video frame was 181.6 ms after recognition in that run.
- The camera stage's text content is empty during successful scanning/playback.
  Controls have 44–48 px targets and accessible names. X resumes scanning; the
  back control ends the camera stream and disposes workers. Body scrolling is
  restored when the camera closes.
- TypeScript, production build, scanner routing, presentation, motion, playback
  session, decoded-frame startup and delivered-media integrity checks pass.

Camera fixtures use synthetic streams on desktop Chromium. Their playback and
startup results are not physical iOS/Android camera or field recognition scores.
