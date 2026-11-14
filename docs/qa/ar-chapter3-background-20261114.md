# Chapter 3 background audit

The full chapter has 15 clips, HTTN01–HTTN15. The old `scene` setting bypassed
transparent playback for several otherwise separable backgrounds. Alpha media
must actually be rebuilt; changing that setting alone is insufficient.

| Clip | Reviewed treatment |
| --- | --- |
| HTTN01 rainbow | Rebuild white key: old alpha retained a faint full-frame gray veil. |
| HTTN02 hail | Remove the dark photographed backdrop, preserve vegetation/soil and falling hail. |
| HTTN03 tornado | Remove white backdrop, preserve cloud and funnel; soften cropped outer source edges. |
| HTTN04 flash flood | Retain the supplied, previously reviewed green-keyed replacement. |
| HTTN05 volcano | Remove dark sky, protect solid mountain with a hard segmentation region, retain lava/smoke. |
| HTTN06 lightning | Isolate cloud/flash effect with transparent dark sky and soft outer perimeter. |
| HTTN07 snow | Subtract the initial dark background instead of including its gray texture in the snow opacity. |
| HTTN08 tropical cyclone | Remove blue studio backdrop, preserve opaque palms and supporting island; source-green fronds override temporary locator dropouts. |
| HTTN09 earthquake | Retain the supplied, previously reviewed green-keyed replacement. |
| HTTN10 tsunami | Fixed gray-backdrop key with opaque water protection. |
| HTTN11 geyser | Remove black backdrop, preserve opaque rock/pool and approximate translucent spray/steam. |
| HTTN12 tides | Retain the supplied, previously reviewed magenta-keyed replacement. |
| HTTN13 aurora | Retain the supplied, previously reviewed emitted-light replacement. |
| HTTN14 solar eclipse | Remove black space, preserve Sun and occulting dark disk rather than keying the disk out. |
| HTTN15 meteor shower | Existing black-background light isolation retained. |

The ten newly corrected assets (including rainbow and tsunami) retain native 1280×720
source pixels and 24 fps, with unchanged AAC narration in all MP4 playback
variants. Each has new immutable media URLs, a real WebM alpha fallback, packed
native/compatible MP4, split color/mask MP4 and a flat black-background preview
for ordinary watch pages. QR page mappings remain unchanged.

Offline checks decode the full 240 frames, compare the delivered codec variants
on dark/gray/light backgrounds, verify opaque RGB interiors and audio hashes,
and retain the historical browser proofs only for the old media they measured.
New files have no claimed physical-phone/browser test. Final media hashes and
numeric measurements are in `ar-reviewed-remakes-v4.json` and
`ar-reviewed-remakes-source-v4.json`.

The independent palm interior check caught a missing wind-blown canopy around
frame 41. Strong green source detail now survives even if U2Net misses that
canopy. The full-frame sequence is also checked for lost opacity in eroded
source vegetation/soil samples, excluding the intentionally feathered 32px
cropped perimeter. Source/fallback proof is saved after each completed asset.

`ar-chapter3-backgrounds-v1.json` covers all 15 active clips, including the
retained meteor asset. Its complete 240-frame decode rejects any remaining
opaque scene bypass and measures actual transparent areas in the delivered
packed matte. Visual sheets also show the decoded matte itself.

`scripts/ar/chapter3_matte.py` uses U2Net full only to locate palms/mountain;
its confidence values are not treated as object opacity. Supporting ground and
solid interiors remain opaque. Processing is sequential under the two-CPU
offline media resource budget.
The locator model SHA256 is
`8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491`.

Limits: source framing still crops some cloud, terrain and water edges. Steam,
spray, snow and cloud transparency lack a ground-truth alpha layer and are
approximations. Lightning is a full-sky source, so its atmosphere is isolated
as an effect rather than claiming that a separate cloud object was recovered.
The existing flash-flood rectangular framing and earthquake oval scene remain
limitations of the supplied replacement sources.
