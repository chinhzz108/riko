"""Compare repaired AR media with the RGB originals, not another keyed copy.

Source-contrast checks protect clear opaque details; they do not constitute
semantic ground truth for every white edge. Review the comparison sheets too.
"""
import argparse
import hashlib
import json
from pathlib import Path

import resource_budget
import cv2
import numpy as np

cv2.setNumThreads(1)

from repair_video_details import ROOT, PUBLIC, MEDIA, WORK, frame_pipe, read_frame, GLOWS, SCENES


def verify(aid):
    report = json.loads((WORK / f"{aid}-repair.json").read_text())
    fingerprint = hashlib.sha256((PUBLIC / report["alphaVideoUrl"].lstrip("/")).read_bytes()).hexdigest()
    existing = WORK / f"{aid}-source-check.json"
    if existing.is_file():
        prior = json.loads(existing.read_text())
        if prior.get("assetSHA256") == fingerprint and prior.get("checkVersion") == 2:
            print(f"{aid}: cached source comparison, {'PASS' if prior['pass'] else 'REVIEW'}", flush=True)
            return prior
    width, height = report["width"], report["height"]
    if aid == "RIKO" or aid.startswith("RECAP_"):
        return None
    original = next((ROOT / "MAM_BOOK_AR/AUDIO_DELIVERY/MP4").glob(f"{aid}-*.mp4"))
    source = frame_pipe(original, width, height)
    actual = frame_pipe(PUBLIC / report["alphaVideoUrl"].lstrip("/"), width, height, alpha=True)
    frames, coverages, errors, scene_holes = 0, [], [], 0
    worst = {"coverage": 1, "frame": 0}
    try:
        while True:
            rgb = read_frame(source, width, height, 3)
            rgba = read_frame(actual, width, height, 4)
            if rgb is None or rgba is None:
                assert rgb is None and rgba is None, f"Frame count mismatch: {aid}"
                break
            alpha = rgba[:, :, 3]
            if aid in SCENES:
                scene_holes += int((alpha < 250).sum())
                errors.append(float(np.abs(rgba[:, :, :3].astype(float) - rgb).mean() / 255))
            elif aid in GLOWS:
                reconstructed = rgba[:, :, :3].astype(float) * (alpha[:, :, None] / 255)
                errors.append(float(np.abs(reconstructed - rgb).mean() / 255))
            elif aid.startswith("HTTN"):
                # Check reconstruction against the known original studio plate.
                # The eclipse uses black; rainbow/tornado use white.
                a = alpha[:, :, None] / 255
                background = 0 if aid == "HTTN14" else 255
                reconstructed = rgba[:, :, :3].astype(float) * a + background * (1-a)
                errors.append(float(np.abs(reconstructed-rgb).mean()/255))
            elif not aid.startswith("HTTN"):
                # Studio backgrounds are neutral and bright. Protect high-contrast
                # subject cores and gray flower detail, excluding antialias edges.
                threshold = 230 if aid in {"DV09", "DV10"} else 160
                detail = (rgb.min(2) < threshold).astype(np.uint8)
                core = cv2.erode(detail, np.ones((3, 3), np.uint8)) > 0
                if core.any():
                    coverage = float((alpha[core] >= 245).mean())
                    coverages.append(coverage)
                    if coverage < worst["coverage"]:
                        worst = {"coverage": coverage, "frame": frames}
                    errors.append(float(np.abs(rgba[:, :, :3][core].astype(float) - rgb[core]).mean() / 255))
            frames += 1
    finally:
        for pipe in [source, actual]:
            pipe.stdout.close()
            pipe.terminate()
            pipe.wait()
    assert frames == report["frames"], f"Incomplete {aid}: {frames}/{report['frames']}"
    result = {"id": aid, "checkVersion": 2, "frames": frames, "mode": "scene" if aid in SCENES else "glow" if aid in GLOWS else "cutout",
        "sourceContrastCoreCoverage": float(np.mean(coverages)) if coverages else None,
        "worstCoreFrame": worst if coverages else None,
        "meanSourceColorError": float(np.mean(errors)) if errors else None,
        "unexpectedSceneTransparentPixels": scene_holes,
        "assetSHA256": fingerprint}
    result["pass"] = bool(scene_holes == 0 and (not coverages or np.mean(coverages) > .985) and (not errors or np.mean(errors) < .03))
    print(f"{aid}: frames={frames} core={result['sourceContrastCoreCoverage']} colorMAE={result['meanSourceColorError']} sceneHoles={scene_holes} {'PASS' if result['pass'] else 'REVIEW'}", flush=True)
    (WORK / f"{aid}-source-check.json").write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", nargs="*")
    args = parser.parse_args()
    reports = sorted(WORK.glob("*-repair.json"))
    for path in reports:
        aid = path.name.removesuffix("-repair.json")
        if not args.ids or aid in args.ids:
            verify(aid)
