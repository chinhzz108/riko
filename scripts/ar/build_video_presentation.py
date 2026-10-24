"""Measure every delivered matte frame to remove only unused transparent padding.

The original media remains unchanged. Runtime uses the conservative union of
all foreground bounds, so animation never gets cropped to a single-frame pose.
"""

import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "src/data/arVideoPresentation.json"
SCENES = {"HTTN12", "HTTN13", "RECAP_HTTN_B"}
GROUNDED = {
    *(f"GT{index:02}" for index in range(1, 11)),
    "DV01", "DV03", "DV04", "DV05", "DV06", "DV07", "DV08",
    "RIKO", "RECAP_GT",
}


def make_packed(asset: dict) -> str:
    """One H.264 clock for both color and matte prevents moving edge mismatch."""
    route = f"/videos/ar/packed/{asset['id']}.mp4"
    destination = ROOT / "public" / route.lstrip("/")
    destination.parent.mkdir(parents=True, exist_ok=True)
    soft_alpha = asset["id"].startswith("HTTN") or asset["id"] == "RIKO"
    if not destination.is_file() or (soft_alpha and "--refine-packed" in sys.argv):
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-threads", "2",
            "-c:v", "libvpx-vp9", "-i", str(ROOT / "public" / asset["alphaVideoUrl"].lstrip("/")),
            "-filter_complex", "[0:v]split[color][matte];[color]format=yuv420p[c];[matte]alphaextract,format=yuv420p[a];[c][a]hstack=inputs=2[v]",
            "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast",
            "-crf", "16" if soft_alpha else "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
            "-movflags", "+faststart", "-threads", "2", str(destination),
        ], check=True)
    return route


def measure(asset: dict) -> dict:
    matte = ROOT / "public" / asset["alphaMaskUrl"].lstrip("/")
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", str(matte),
    ], text=True))["streams"][0]
    width = 320
    height = max(2, round(probe["height"] / probe["width"] * width / 2) * 2)
    process = subprocess.Popen([
        "ffmpeg", "-v", "error", "-threads", "2", "-i", str(matte),
        "-vf", f"scale={width}:{height},format=gray", "-an",
        "-f", "rawvideo", "pipe:1",
    ], stdout=subprocess.PIPE)
    left, top, right, bottom = width, height, 0, 0
    frames = 0
    assert process.stdout is not None
    while True:
        data = process.stdout.read(width * height)
        if not data:
            break
        if len(data) != width * height:
            raise RuntimeError(f"Truncated matte frame for {asset['id']}")
        pixels = np.frombuffer(data, dtype=np.uint8).reshape(height, width)
        rows, columns = np.nonzero(pixels > 8)
        if len(rows):
            left = min(left, int(columns.min()))
            top = min(top, int(rows.min()))
            right = max(right, int(columns.max()) + 1)
            bottom = max(bottom, int(rows.max()) + 1)
        frames += 1
    if process.wait() != 0 or not frames or right <= left:
        raise RuntimeError(f"Could not measure alpha for {asset['id']}")
    padding_x = math.ceil(width * 0.015) + 2
    padding_y = math.ceil(height * 0.015) + 2
    bounds = {
        "left": round(max(0, left - padding_x) / width, 6),
        "top": round(max(0, top - padding_y) / height, 6),
        "right": round(min(width, right + padding_x) / width, 6),
        "bottom": round(min(height, bottom + padding_y) / height, 6),
    }
    if asset["id"] in SCENES:
        bounds = {"left": 0, "top": 0, "right": 1, "bottom": 1}
    print(f"{asset['id']}: {frames} frames, bounds={bounds}", flush=True)
    return {
        "bounds": bounds,
        "grounded": asset["id"] in GROUNDED,
        "mode": "scene" if asset["id"] in SCENES else "cutout",
        "measuredFrames": frames,
    }


if __name__ == "__main__":
    manifest = json.loads((ROOT / "public/videos/ar/manifest.json").read_text(encoding="utf-8"))
    profiles = {}
    previous = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.is_file() else {}
    for asset in manifest:
        if not asset.get("alpha"):
            continue
        profile = previous.get(asset["id"]) if "--pack-only" in sys.argv else None
        profile = profile or measure(asset)
        if "--pack" in sys.argv or "--pack-only" in sys.argv:
            profile["packedVideoUrl"] = make_packed(asset)
            print(f"{asset['id']}: packed color/matte ready", flush=True)
        elif previous.get(asset["id"], {}).get("packedVideoUrl"):
            profile["packedVideoUrl"] = previous[asset["id"]]["packedVideoUrl"]
        profiles[asset["id"]] = profile
    OUTPUT.write_text(json.dumps(profiles, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(profiles)} presentation profiles to {OUTPUT}")
