# AR movement and frame pacing — 24 October 2026

## Changes

- Drag one pointer to reposition the video relative to its tracked book page.
- Pinch two pointers to resize (50–250%). Lifting one finger rebases the drag.
- Reset restores the initial position and 100% size; UI buttons do not drag content.
- A separate presentation group filters translation, quaternion rotation and scale. MindAR retains ownership of its raw anchors. Brief tracking gaps hold the last pose.
- Packed color and matte share one video texture and a shader sample, keeping their frames synchronized. VideoTexture controls uploads from decoded frames.
- QR decoding and LiteRT preprocessing/inference/postprocessing run in separate workers. LiteRT uses a classic worker bootstrap because its official loader calls `importScripts`. Compatible inference remains available when workers cannot initialize.
- Viewport rectangles are cached by ResizeObserver; automatic fitting is eased.

## Measured replay

The real app and MindAR receive a synthetic 960×720 / 24fps camera stream of `book-c1-p03`. Measurements are ten seconds after video startup in the Windows in-app Chromium browser. These are replay results, not iPhone or Android hardware measurements.

| Measurement | Before | Final |
| --- | ---: | ---: |
| Render callbacks | 451 | 562 |
| 95th percentile frame interval | 50 ms | 33.3 ms |
| Maximum frame interval | 116.6 ms | 50.1 ms |
| Main thread tasks over 50 ms | 21 | 2 |
| Total time in those tasks | 1,436 ms | 108 ms |
| Video texture upload calls | 896 | 258 |

An earlier worker run returned 539 callbacks, one long task and 255 uploads. Timing varies with system load; these numbers are not a device FPS guarantee.

## Checks

- TypeScript and production Vite build.
- `verify_motion.mjs`: scale limits, gesture center, 30/60fps filter parity, faster deliberate movement and quaternion wraparound at 180 degrees.
- `gesture-qa.html`: drag, pinch, one-finger continuation, cancellation, capture cleanup, disabled tracking, button exclusion and filter noise. All 12 checks passed; synthetic alternating position noise was reduced by 90.8%.
- Existing `verify_presentation.mjs`: all 45 animation crops, 54 page layouts and 504 viewing poses.
- Existing `verify_scan_logic.mjs`: QR routes, covers and 800ms fallback logic.
- Browser replay uses the actual production bundle and classic worker. A successful detector response and visible moving packed-alpha video were verified. A real browser pointer drag and reset were exercised.
- The native WebM path was dragged, reset, tracked on a tilted page, and switched from landscape `GT01` to portrait `RIKO` (406×720). The latter was visibly playing at 3.45 seconds with opacity 1.
- A QR-only synthetic camera frame opened the correct `book-c1-p03` fallback video through the QR worker, with no book target locked.
- `packed-media-qa.html` rendered the single-texture shader against native WebM alpha: all 45 clips passed with zero failures. This checks decoded frames and playback advancement, not every animation frame.

Hardware touch gestures, camera shake and frame pacing on physical iPhones/Android phones still require device checks. The visual content remains a video cutout; dragging does not create a new 3D viewing angle of the subject.

## References

- [Three.js VideoTexture updates](https://threejs.org/docs/pages/VideoTexture.html)
- [MindAR smoothing and tracking tolerance](https://hiukim.github.io/mind-ar-js-doc/quick-start/tracking-config/)
- [MDN pointer pinch gestures](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures)
