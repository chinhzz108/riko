# Reviewed aurora and tide replacement media

The previous tide clip retained an opaque picture and black side strip. The
previous aurora looked like cropped colored fabric. The reviewed replacements
use the new tide/aurora takes supplied on 13 November 2026. The flash-flood and
earthquake candidates are withheld: the former expands into a rectangular
picture, while the latter has a baked oval picture boundary and weak shaking.

Only HTTN12 and HTTN13 change. Canonical printed QR URLs and all 54 page mappings
stay stable. New `/remake-v4/` URLs prevent immutable-cache collisions. The
bundled profile and revalidated manifest select the same files; tides now use
the packed-alpha path instead of the opaque native scene path.

The builder preserves the supplied native 1248×704 dimensions, removes the tide
magenta backdrop, and unassociates aurora light from its black background.
Color and matte are encoded side-by-side in one H.264 stream to share a clock.
A smaller packed encode and VP9 alpha file are available as decode fallbacks.
The existing Vietnamese narration is copied from the previous audio-bearing
source; generated audio from the new take is excluded.
The tide preview for the QR overlay and ordinary watch page is separately
composited onto black at `/original/remake-v4/HTTN12-keyed.mp4`; neither plain
player can apply the AR shader. The raw magenta take remains a source reference
only. Existing immutable media URLs are preserved.

`scripts/ar/build_reviewed_remakes.py` accepts only the reviewed input hashes.
It decodes and compares all 240 frames per clip, checks packed matte/composites
against independently decoded WebM alpha on dark/mid/white backgrounds, checks
opaque-core retention and outer transparency, and rejects files at or above the
Cloudflare Pages 25 MiB limit. The report is
`docs/qa/ar-reviewed-remakes-v4.json`. CI checks all new file hashes in addition
to retaining historical v2/v3 media evidence.

`scripts/ar/verify_reviewed_remakes.py` additionally decodes every frame of the
native packed, compatible packed, separate color/mask, preview and WebM files.
It compares the aurora emission over black to the supplied source and the tide
opaque interior colors to its source. It compares fallback composites to native
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

Pre-release validation passed: the production Vite build, TypeScript, scan
routing, playback sessions, decoded-frame startup, presentation and motion
checks, and the detail-asset hash gate. Both delivered packed contact sheets
were visually reviewed at seven times on three backgrounds. The additional
decode pass covered all six variants per clip and the raw tide reference,
240 video frames each. Maximum
compatible/native composite MAE was 0.00180 for aurora and 0.00447 for tides;
the maximum tide opaque-interior RGB MAE against source was 0.00799 (0–1 scale).
All four AAC-bearing MP4 variants per clip preserve the old narration bytes.
