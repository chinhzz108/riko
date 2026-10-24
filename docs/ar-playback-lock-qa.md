# AR playback, close and automatic scanning — 25 October 2026

## Resulting behavior

One successful page, pop-up or QR recognition opens one video. The video stays
open until the viewer presses its X; covering the book does not hide it. X
closes the media and automatically resumes recognition with the same live camera.
The just-closed page is suppressed until it leaves the camera, preventing an
immediate reopen. Another page can open immediately.

While playing (including media loading), the QR worker is terminated, pending
LiteRT work is cancelled and its worker is disposed, and MindAR's controller
stops processing after its current frame. The camera stream remains live.
Closing the entire scanner stops the stream and disposes the renderer.

The video holds its position in the camera viewport. It is **screen anchored**,
not continuously attached to the physical book. Dragging and 50–250% zoom still
work. This deliberately removes pose updates and their jitter while playback is
open; it does not turn a 2D cutout into a 3D object.

## Implementation and pacing

- `arPlaybackSession.js` gates stale asynchronous video loads and repeated target
  events. The close action returns it to scanning, with a latch for the dismissed
  page.
- `arRecognitionPause.js` drains MindAR 1.2.5 at `processDone`, then waits two
  animation-frame yields before restarting. This lets the old `tf.nextFrame`
  loop exit before the shared processing flag becomes true again. Concurrent
  resume requests share one promise. Calling `MindARThree.stop()` here would
  also stop the camera, so it is reserved for scanner teardown.
- Native WebM alpha uses browser video composition, with transforms updated only
  on layout or gestures. All 11 opaque scene profiles use their untouched source
  MP4 through the same native path, including on Safari.
- Packed color/matte MP4 is drawn on decoded video frames using
  `requestVideoFrameCallback`, coalesced through one pending animation frame.
  Older browsers redraw only when `currentTime` changes. No continuous Three.js
  animation loop runs. The existing separate-matte compatibility path remains.
- No media, crop profile, QR URL or model file was re-encoded or changed.

## Verification

Browser checks used the real React component, Three.js and decoded media in the
Windows in-app Chromium browser, with a synthetic 640×480 camera. Safari user
agent selection exercised the packed path; it is not a physical Safari test.
Only one camera test tab was active at a time.

| Check | Observed result |
| --- | --- |
| Real MindAR, `book-c3-p12` | Locked in 9 processed frames, then controller stopped. |
| Cover and shake after that lock | MindAR stayed at 9 frames; QR stayed at 2 jobs; the camera stayed live and video frames advanced. |
| Opaque `HTTN05` scene | Native 1280×720 source MP4; CSS transform and 4 stage renders remained unchanged during the held sample. |
| X, then a different real page image | MindAR restarted, recognized `book-c1-p03`, opened packed `GT01`, and stopped again: 2 starts / 2 stops. |
| Native alpha `DV10` | Continued after covering/shaking; tracker, model and QR counters stayed fixed. Real drag, zoom and reset worked. |
| Packed alpha `DV10` | Continued after covering/shaking; approximately one stage draw per presented frame. |
| Fresh real MindAR / packed `GT01` | Tracker stayed at 5 frames and QR at 1 job while covered/shaken; presented frames advanced from 75 to 1,221 with zero reported drops in that sample. |
| Actual QR worker | Decoded the correct `rikokid.me/watch/book-c1-p03` URL and opened `GT01`; X resumed QR scanning without immediately reopening the same code. |
| Pop-up lifecycle | A simulated confident model result opened the correct weather clip; X resumed scanning and suppressed the still-visible result. |
| Camera stop | Returned to the intro and ended the synthetic camera track. |

The real MindAR test did not load the LiteRT model. Pop-up tests inject detection
results to check playback lifecycle; they do not measure model accuracy. Frame
drops vary with foreground/background scheduling and system load. A long packed
replay recorded substantial drops, so these checks do not establish a mobile FPS
guarantee or eliminate the need for physical iPhone testing.

Compact evidence is saved in `docs/qa/ar-playback-lock.json`; the screenshot shows
the real-MindAR transition to the next page after X. The local fixture is
`scripts/ar/locked-playback-qa.html`; it expects previously rendered page images
under `tmp/ar-targets/pages/`. Add `?real=1` for MindAR and `&packed=1` for the
packed media selection. LiteRT remains simulated in this fixture.

Automated checks:

- `verify_playback_session.mjs`: 1,000 repeated/lost events, 27 viewport layouts,
  and 50 pause/drain/resume races, including duplicate close/resume and stale work.
- TypeScript, QR routing/800ms fallback, gesture math and presentation checks.
- Existing media audit: 45 clips, 54 routes and 225 certified file hashes.
- Production build and the same checks run in GitHub Actions before deployment.

## Laptop resource controls

Tailwind's source base is now restricted to `src`, and Vite ignores generated
media folders in its watcher. Previously its automatic scan traversed 20.7 GB
of temporary raw frames and the Vite process grew to about 4.4 GB RSS. After the
change, the local Vite process was observed at about 111–133 MB RSS.

Local CLI checks use `run_budgeted.py`: two logical CPUs, Idle priority on
Windows, one BLAS/OpenCV thread, a 768 MB Node heap limit and two Rayon threads.
The production build runs remotely. Temporary media was left in place.

## References

- [MindAR 1.2.5 controller processing loop](https://github.com/hiukim/mind-ar-js/blob/v1.2.5/src/image-target/controller.js)
- [MindAR 1.2.5 camera start/stop behavior](https://github.com/hiukim/mind-ar-js/blob/v1.2.5/src/image-target/three.js)
- [MDN decoded video-frame callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [Three.js VideoTexture updates](https://threejs.org/docs/pages/VideoTexture.html)
- [Tailwind explicit source base paths](https://tailwindcss.com/docs/detecting-classes-in-source-files)
