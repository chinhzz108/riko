# AR media detail preservation — 24 October 2026

## Cause and repair

The previous saliency mask was used as per-pixel opacity. It removed supporting
objects (flower petals, branches, rails) and made solid parts translucent. A
comparison between two encodings of that same damaged mask could not detect the
lost source content. A larger U2Net model was also tried and still lost details.

The repaired outputs come from the canonical audio-bearing RGB MP4 originals,
not from recompressing the old keyed files. Opaque subject interiors are restored;
known studio backdrops are isolated separately, with a subpixel antialias band.
White petals and the owl's branch use a fitted studio background rather than a
generic saliency threshold. Crop bounds cover every frame including faint effects.

The owner's explicit choice is to keep complex scenes as complete opaque videos
in AR. Those clips are HTTN02, 03, 04, 05, 06, 08, 09, 10, 11, 12 and 14. Their scenery is
part of the content. They do not need an artificial ground shadow or a cropped
saliency rectangle.

Snow, aurora and meteors retain intentional light transparency. Their foreground
RGB is unassociated before applying alpha, to avoid dimming twice. This follows
the [W3C source-over compositing equations](https://www.w3.org/TR/compositing-1/#simplealphacompositing).
Solid AR materials no longer fade their entire surface during tracker reacquisition;
material opacity multiplies the texture's alpha, as documented by
[Three.js Material](https://threejs.org/docs/pages/Material.html#opacity).

## Delivery

- Versioned `/hq2/` WebM alpha, H.264 color/matte, and single-clock packed MP4.
- Up to 960 pixels on the longer source edge; no fake detail upscaling.
- Original MP4s copied byte-for-byte for QR/watch playback for all 35 page clips.
- Nine recaps assembled from repaired lossless intermediates, before encoding.
- Printed QR URLs and all 54 page-to-video mappings are preserved.
- The scanner uses a versioned manifest request and HTTP revalidation, so an old
  force-cached manifest cannot select the previous damaged WebM files.
- Each delivered media file must stay below the Cloudflare Pages 25 MiB limit.

## Checks and their limits

`verify_video_details.py` compares every decoded frame of the 35 page clips with
the RGB originals. It checks high-contrast opaque subject cores for the 20 object
clips, every alpha pixel for complete scenes, and reconstruction over the known
studio background for the effects. High-contrast cores are not semantic ground
truth for every white or motion-blurred edge.

`verify_packed_alpha.py` checks every frame of all 45 delivered clips for frame
count and packed matte fidelity against the repaired WebM. That verifies codec
consistency; the independent original-source comparison above verifies content.

The browser fixture `packed-media-qa.html` decodes the videos, uses the actual app
shader, compares rendered alpha and opaque-core colors, and checks playback
advancement. The separate `detail-qa.html` presents source/before/after views.
Visual review uses 1, 4 and 8 second snapshots on contrasting backgrounds.

`docs/qa/ar-media-detail-v2.json` records the completed checks and media hashes.
CI verifies those hashes and the stable printed page routes before deployment.

Completed checks for this revision:

| Check | Result |
| --- | --- |
| Original-source frame comparisons | 35 clips / 8,400 frames |
| Packed matte comparisons | 45 clips / 9,888 frames; minimum SSIM 0.977856 |
| Browser decode, shader and playback | 45 / 45 passed; no failures |
| Intentional full scenes | 11 clips; zero unexpected transparent pixels |
| Opaque source contrast cores | Minimum per-clip mean coverage 99.9994% |
| Certified delivery files | 225 hashes; largest file 14,418,717 bytes |
| Printed page routes | 54 preserved |
| TypeScript / sizing / motion / QR logic | Passed |

The core-coverage percentage describes only the explicitly tested high-contrast
interiors. It is not a percentage score for overall visual quality.

![Original, old matte and repaired petals](qa/ar-detail-before-after.png)

These checks do not establish perfect matting, semantic accuracy of every edge,
or physical iPhone performance. Thin studio edge halos, original motion blur and
subjects entering or leaving the original frame can remain. AR videos remain
camera-facing 2D planes, not reconstructed 3D geometry.

## Laptop resource budget

Offline media scripts import `resource_budget.py`: two logical CPUs, idle Windows
priority, one BLAS/OpenCV worker. FFmpeg children inherit the affinity. Run one
offline task at a time, and close/pause browser AR fixtures while encoding or
comparing clips. Do not run a GPU benchmark concurrently with media processing.
