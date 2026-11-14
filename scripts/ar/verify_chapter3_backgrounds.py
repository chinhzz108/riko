"""Decode every active chapter-three packed matte; review over light/dark.

This measures actual delivered transparency, not semantic ground-truth quality.
"""
import json
from pathlib import Path

import resource_budget
import cv2
import numpy as np
from PIL import Image, ImageDraw

from build_reviewed_remakes import decoder, probe, read_frame, sha

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
OUT = ROOT / "output/qa/chapter3-background-20261114"
cv2.setNumThreads(1)


def verify(asset, profile):
    aid = asset["id"]
    assert asset["presentationMode"] in {"cutout", "glow"}, f"{aid}: opaque scene bypasses matte"
    assert profile["mode"] == asset["presentationMode"]
    assert profile["packedVideoUrl"] == asset["packedVideoUrl"]
    assert profile["alphaVideoUrl"] == asset["alphaVideoUrl"]
    path = PUBLIC / asset["packedVideoUrl"].lstrip("/")
    stream = next(s for s in probe(path)["streams"] if s["codec_type"] == "video")
    width, height = stream["width"], stream["height"]
    assert width % 2 == 0
    half = width // 2
    pipe = decoder(path, width, height)
    transparency, alpha_means, samples = [], [], []
    sample_indices = [24, 72, 144, 216]
    try:
        for index in range(240):
            frame = read_frame(pipe, width, height, 3)
            assert frame is not None, f"{aid}: missing frame {index}"
            alpha = frame[:, half:, 1].astype(np.float32) / 255
            transparency.append(float(np.mean(alpha < .04)))
            alpha_means.append(float(alpha.mean()))
            if index in sample_indices:
                samples.append((index, frame[:, :half].astype(np.float32)/255, alpha))
        assert pipe.stdout.read(1) == b"" and pipe.wait() == 0
    finally:
        pipe.stdout.close()
        if pipe.poll() is None:
            pipe.terminate()
            pipe.wait()
    transparent_frames = sum(value > .01 for value in transparency)
    assert max(alpha_means) > .001, f"{aid}: foreground was erased"
    sheet = Image.new("RGB", (1280, 4*204), "#202020")
    draw = ImageDraw.Draw(sheet)
    for row, (index, color, alpha) in enumerate(samples):
        for col, bg in enumerate([(.04, .04, .04), (.2, .5, .7), (.9, .9, .9), None]):
            if bg is None:
                tile = np.repeat(alpha[..., None], 3, axis=2)
            else:
                tile = color*alpha[..., None] + np.array(bg)*(1-alpha[..., None])
            tile = Image.fromarray(np.uint8(np.clip(tile*255, 0, 255))).resize((320, 180))
            sheet.paste(tile, (col*320, row*204+24))
            draw.text((col*320+5, row*204+5), f"{aid} {index/24:.1f}s {'matte' if bg is None else 'decoded packed'}", fill="white")
    sheet.save(OUT / f"{aid}-active-transparency.jpg", quality=94)
    return {"id": aid, "pass": transparent_frames >= 120, "mode": profile["mode"], "packedVideoUrl": asset["packedVideoUrl"],
            "packedSHA256": sha(path), "alphaVideoUrl": asset["alphaVideoUrl"],
            "alphaSHA256": sha(PUBLIC / asset["alphaVideoUrl"].lstrip("/")),
            "frames": 240, "framesWithTransparentAreaAboveOnePercent": sum(value > .01 for value in transparency),
            "minimumTransparentFraction": min(transparency), "meanTransparentFraction": float(np.mean(transparency)),
            "maximumMeanAlpha": max(alpha_means), "browserTested": False, "phoneTested": False}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((PUBLIC / "videos/ar/manifest.json").read_text(encoding="utf-8"))
    profiles = json.loads((ROOT / "src/data/arVideoPresentation.json").read_text(encoding="utf-8"))
    assets = sorted((a for a in manifest if a["id"].startswith("HTTN")), key=lambda a: a["id"])
    assert len(assets) == 15
    reports = []
    for asset in assets:
        reports.append(verify(asset, profiles[asset["id"]]))
        print(f"{asset['id']}: 240 packed frames, transparency pass={reports[-1]['pass']}, transparent area={reports[-1]['meanTransparentFraction']:.3f}", flush=True)
    report = {"date": "2026-11-14", "kind": "offline-full-chapter-packed-transparency",
              "limits": ["Transparency measurements and visual samples do not establish semantic ground truth.",
                         "Cropped terrain/water/cloud source edges remain source limitations.",
                         "No new browser/physical-phone playback result is claimed."], "assets": reports}
    (OUT / "full-chapter-transparency-audit.json").write_text(json.dumps(report, indent=2)+"\n")
    assert all(a["pass"] for a in reports), "Background audit failed: " + ", ".join(a["id"] for a in reports if not a["pass"])
    (ROOT / "docs/qa/ar-chapter3-backgrounds-v1.json").write_text(json.dumps(report, indent=2)+"\n")
