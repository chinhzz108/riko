# Reviewed replacement media

The previous tide clip retained an opaque picture and black side strip. The
previous aurora looked like cropped colored fabric. The reviewed replacements
use the four new takes supplied on 13 November 2026. Flood and earthquake were
initially withheld after visual review. The user subsequently explicitly asked
to replace both with these supplied clips, so HTTN04 and HTTN09 are now included.
Flood retains a rectangular scene; earthquake retains its oval scene boundary,
opening reveal and weak shaking. Removing the green background does not change
those source characteristics.

HTTN04, HTTN09, HTTN12 and HTTN13 change. Canonical printed QR URLs and all 54 page mappings
stay stable. New `/remake-v4/` URLs prevent immutable-cache collisions. The
bundled profile and revalidated manifest select the same files; tides now use
the packed-alpha path instead of the opaque native scene path.

The builder preserves the supplied native 1248×704 or 1280×720 dimensions,
removes the green flood/earthquake backdrops and tide magenta backdrop, and
unassociates aurora light from its black background. Border-connected keying
protects enclosed scene details, including plants inside the earthquake scene.
Color and matte are encoded side-by-side in one H.264 stream to share a clock.
A smaller packed encode and VP9 alpha file are available as decode fallbacks.
The existing Vietnamese narration is copied from the previous audio-bearing
source; generated audio from the new take is excluded.
The flood, earthquake and tide previews for the QR overlay and ordinary watch
page are separately composited onto black at
`/original/remake-v4/HTTNxx-keyed.mp4`; neither plain player can apply the AR
shader. Raw green/magenta takes remain source references only. Existing
immutable media URLs are preserved.

`scripts/ar/build_reviewed_remakes.py` accepts only the reviewed input hashes.
It decodes and compares all 240 frames per clip, checks packed matte/composites
against independently decoded WebM alpha on dark/mid/white backgrounds, checks
opaque-core retention and outer transparency, and rejects files at or above the
Cloudflare Pages 25 MiB limit. The report is
`docs/qa/ar-reviewed-remakes-v4.json`. CI checks all new file hashes in addition
to retaining historical v2/v3 media evidence.

`scripts/ar/verify_reviewed_remakes.py` additionally decodes every frame of the
native packed, compatible packed, separate color/mask, preview and WebM files.
It compares the aurora emission over black to the supplied source and each
opaque scene's interior colors to its source. It compares fallback composites to native
packed composites, verifies the AAC narration is byte-identical in all four MP4
variants carrying audio, and saves decoded composite contact sheets on dark,
blue and light backgrounds. Source/fallback evidence is stored separately in
`docs/qa/ar-reviewed-remakes-source-v4.json`. These color checks complement the
visual review; they do not independently validate the semantic matte algorithm.

The new certificate is explicitly **offline** evidence. No browser tool was
available for this revision, and no new browser render or physical iPhone/Android
performance result is claimed. Earlier v3 browser proofs remain scoped to their
original file hashes; they are not evidence that these replacement files were
rendered in a browser. The renderer and playback code are unchanged. Existing
startup/session/gesture/route checks and the production build are rerun.

The aurora is intentionally translucent, is soft in the supplied source, and
fades substantially near the end. It will be less visible over a bright camera
image. The tide uses an isolated scene boundary and an accelerated water-level
cycle. Codec agreement does not prove perfect semantic matting at every edge.
Neither these clips nor the existing AR renderer reconstruct a 3D scene.

Initial tide/aurora validation passed: the production Vite build, TypeScript, scan
routing, playback sessions, decoded-frame startup, presentation and motion
checks, and the detail-asset hash gate. Both delivered packed contact sheets
were visually reviewed at seven times on three backgrounds. The additional
decode pass covered all six variants per clip and the raw tide reference,
240 video frames each. Maximum
compatible/native composite MAE was 0.00180 for aurora and 0.00447 for tides;
the maximum tide opaque-interior RGB MAE against source was 0.00799 (0–1 scale).
All four AAC-bearing MP4 variants per clip preserve the old narration bytes.

Flood/earthquake validation also passed all 240 frames of seven decoded streams
per clip, including each plain-player preview and raw source reference. Their
delivered packed contact sheets were reviewed at seven times on dark, blue and
light backgrounds. Worst opaque-interior RGB MAE against source was 0.01056 for
flood and 0.00975 for earthquake (0–1 scale); copied AAC narration matched the
old source in all four audio-bearing MP4 variants. The detail gate now checks
273 media hashes and four replacement reports alongside 54 stable page routes.

Dense flood-water texture exceeded the hosting limit at the initial settings.
The delivered flood keeps 1280×720 pixels with H.264 CRF 18 for native color,
packed and preview, VP9 CRF 26 for alpha, and a 1920-wide compatible packed
encode. Native packed is 22,945,745 bytes; WebM is 20,531,824 bytes; the keyed
preview is 21,915,850 bytes. All new files, including raw references, remain
below the 25 MiB per-file limit. These are lossy encodes, not a lossless claim.

Release routing follow-up: while the manifest was pending, the bundled asset
omitted `alphaVideoUrl`. If both packed MP4 decodes failed, native playback could
therefore select the legacy canonical WebM. All 45 bundled profiles now include
their current alpha URL, and native alpha playback rejects a missing current
source instead of silently selecting a legacy URL. A regression check exercises
this pending-manifest/packed-failure combination for all 54 routes. This is a
confirmed code path; there is no client trace proving it was the user's path.

Each new camera session revalidates its manifest rather than reusing one
fulfilled promise indefinitely; stale requests cannot replace a newer result.
QR selection is refreshed when that response arrives. Watch pages revalidate
their preview URLs on entry and when returning to the tab. The application
shell, scanner and watch routes use `no-store`; immutable media URLs stay
immutable. The live AR stage and QR video expose the chosen asset ID and URL as
data attributes so future client reports can be checked against actual playback.
