# Tsunami video background correction

HTTN10 (`book-c3-p13`) previously used `scene` presentation and an opaque
gray-background source. Its old alpha files also retained that background, so
changing the presentation flag alone could not repair it.

The replacement uses the original 1280×720, 24 fps, 240-frame tsunami clip and
copies the existing AAC narration into the MP4 variants. A fixed RGB32 backdrop
estimate avoids treating the rising wave as background. Connected cyan water
and foam protect the dark water body, with a soft transition around spray.

All six active playback variants use new `/remake-v4/HTTN10` URLs. The manifest
and bundled profile select `cutout` and the current alpha fallback; the printed
QR route stays unchanged. The plain watch preview is composited over black
because an ordinary MP4 player cannot apply the AR alpha shader.

Reproduction:

```text
python scripts/ar/build_reviewed_remakes.py --incoming MAM_BOOK_AR/ORIGINAL_DOWNLOADS --id HTTN10 --publish
python scripts/ar/verify_reviewed_remakes.py --id HTTN10
node scripts/ar/verify_detail_assets.mjs
node scripts/ar/verify_video_playback.mjs
```

Full-duration decoded checks and media hashes are recorded in
`ar-reviewed-remakes-v4.json` and `ar-reviewed-remakes-source-v4.json`. Tsunami
has a specific known-background transparency check and bottom-water retention
check: its water legitimately touches the bottom and sides, so the transparent
outer-border requirement used for isolated objects would destroy real water.
The existing outer-border checks remain required for the other replacements.

Limits: fine spray is an approximation without a ground-truth matte. The source
already crops the water at the bottom/sides; this repair does not reconstruct
those missing edges. Offline decoding and compositing do not certify physical
phone or browser playback.
