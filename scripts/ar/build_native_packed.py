"""Preserve native RGB detail in single-clock H.264 color/matte AR videos.

The certified v2 object matte is retained, not predicted again. Its resampling
does not create new edge information. Glows are unassociated from native RGB.
All new files are versioned; v2 media remains available as a compatibility path.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

import resource_budget
import numpy as np
from repair_video_details import frame_pipe, read_frame, probe

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "videos/ar/packed/native-v3"
AUDIT = ROOT / "tmp/ar-native-v3"
FPS = 24
EFFECT_ENCODER_VERSION = "stable-transparent-rgb-crf18-v3"


def sha(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def encode(asset, source, width, height, frames, destination):
    common = ["ffmpeg", "-v", "error", "-y", "-threads", "1", "-filter_complex_threads", "1"]
    effect = asset["id"].startswith("HTTN")
    if effect:
        # Stream native RGBA straight into the encoder; no multi-GB raw files.
        command = common + ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}", "-r", str(FPS), "-i", "pipe:0", "-i", str(source),
            "-filter_complex", "[0:v]split[c][m];[c]format=yuv420p[color];[m]alphaextract,format=yuv420p[alpha];[color][alpha]hstack=inputs=2[out]", "-map", "[out]", "-map", "1:a?"]
    else:
        matte = PUBLIC / asset["alphaVideoUrl"].lstrip("/")
        command = common + ["-i", str(source), "-c:v", "libvpx-vp9", "-i", str(matte),
            "-filter_complex", f"[0:v]fps={FPS},settb=AVTB,setpts=N/({FPS}*TB),setsar=1,format=yuv420p[c];[1:v]alphaextract,scale={width}:{height}:flags=lanczos,format=yuv420p,settb=AVTB,setpts=N/({FPS}*TB)[m];[c][m]hstack=inputs=2[out]", "-map", "[out]", "-map", "0:a?"]
    crf = "18" if asset["id"] in {"HTTN07", "HTTN13", "HTTN15"} else "14" if effect else "12"
    command += ["-frames:v", str(frames), "-c:v", "libx264", "-threads", "2", "-preset", "fast", "-crf", crf, "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(destination)]
    if not effect:
        subprocess.run(command, check=True)
        return
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    decoder = frame_pipe(source, width, height)
    reference = frame_pipe(PUBLIC / asset["alphaVideoUrl"].lstrip("/"), width, height, alpha=True)
    errors = []
    try:
        for index in range(frames):
            rgb = read_frame(decoder, width, height, 3)
            old = read_frame(reference, width, height, 4)
            if rgb is None or old is None:
                raise RuntimeError(f"Missing source frame {asset['id']}:{index}")
            # The certified light matte was measured after downsampling. Do not
            # re-key native codec noise and turn a faint white/black plate solid.
            alpha = old[:, :, 3]
            a = alpha[:, :, None].astype(np.float32) / 255
            background = 255 if asset["id"] == "HTTN01" else 0
            divisor = a if background else rgb.max(2, keepdims=True).astype(np.float32) / 255
            color = np.divide(rgb.astype(np.float32) - background * (1-a), divisor, out=np.zeros_like(rgb, dtype=np.float32), where=divisor>0)
            color[alpha == 0] = 0
            color = np.clip(color, 0, 255).astype(np.uint8)
            # Codec noise divided by tiny alpha becomes high-entropy invisible
            # RGB. Stabilize only that <= 4/255 band, leaving the matte intact.
            # The composited change is bounded to four 8-bit channel levels.
            if asset["id"] == "HTTN07":
                neutral = np.array([255, 255, 255], dtype=np.uint8)
            else:
                visible = color[alpha >= 64]
                neutral = np.median(visible, axis=0).astype(np.uint8) if len(visible) else np.array([255, 255, 255], dtype=np.uint8)
            color[alpha <= 4] = neutral
            errors.append(float(np.abs(color*a + background*(1-a) - rgb).mean()/255))
            encoder.stdin.write(np.dstack([color, alpha]).tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError(f"Encoding failed: {destination}")
    finally:
        for pipe in [decoder, reference]:
            pipe.stdout.close(); pipe.terminate(); pipe.wait()
        if encoder.poll() is None:
            encoder.terminate(); encoder.wait()
    reconstruction = float(np.mean(errors))
    assert reconstruction < .03, f"{asset['id']}: native source reconstruction error {reconstruction}"
    return reconstruction


def compare(asset, source, packed, width, height):
    matte = PUBLIC / asset["alphaVideoUrl"].lstrip("/")
    command = ["ffmpeg", "-hide_banner", "-threads", "1", "-filter_complex_threads", "1", "-i", str(packed), "-threads", "1", "-c:v", "libvpx-vp9", "-i", str(matte)]
    graph = f"[0:v]crop=iw/2:ih:iw/2:0,format=gray,settb=AVTB,setpts=N/({FPS}*TB)[p];[1:v]alphaextract,scale={width}:{height}:flags=lanczos,format=gray,settb=AVTB,setpts=N/({FPS}*TB)[a];[p][a]ssim"
    result = subprocess.run(command + ["-filter_complex", graph, "-an", "-f", "null", "-"], text=True, capture_output=True, check=True)
    matte_ssim = float(re.search(r"All:([\d.]+)", result.stderr).group(1))
    if matte_ssim < .97:
        raise RuntimeError(f"{asset['id']} matte SSIM: {matte_ssim}")
    color_ssim = None
    if not asset["id"].startswith("HTTN"):
        graph = f"[0:v]crop=iw/2:ih:0:0,settb=AVTB,setpts=N/({FPS}*TB)[p];[1:v]settb=AVTB,setpts=N/({FPS}*TB)[s];[p][s]ssim"
        result = subprocess.run(["ffmpeg", "-hide_banner", "-threads", "1", "-filter_complex_threads", "1", "-i", str(packed), "-threads", "1", "-i", str(source), "-filter_complex", graph, "-an", "-f", "null", "-"], text=True, capture_output=True, check=True)
        color_ssim = float(re.search(r"All:([\d.]+)", result.stderr).group(1))
        if color_ssim < .98:
            raise RuntimeError(f"{asset['id']} original RGB SSIM: {color_ssim}")
    return matte_ssim, color_ssim


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    manifest_path = PUBLIC / "videos/ar/manifest.json"
    profiles_path = ROOT / "src/data/arVideoPresentation.json"
    assets = json.loads(manifest_path.read_text(encoding="utf-8"))
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True); AUDIT.mkdir(parents=True, exist_ok=True)
    eligible = [a for a in assets if (a["id"].startswith(("GT", "DV")) or profiles[a["id"]]["mode"] in {"glow"} or a["id"] == "HTTN01")]
    for asset in eligible:
        aid = asset["id"]
        if args.ids and aid not in args.ids:
            continue
        source = PUBLIC / asset["previewVideoUrl"].lstrip("/")
        metadata = probe(source)["streams"][0]
        width, height = metadata["width"], metadata["height"]
        frames = profiles[aid]["measuredFrames"]
        destination = OUTPUT / f"{aid}.mp4"
        report_path = AUDIT / f"{aid}.json"
        source_hash = sha(source)
        matte_hash = sha(PUBLIC / asset["alphaVideoUrl"].lstrip("/"))
        prior = json.loads(report_path.read_text()) if report_path.exists() else {}
        encoder_current = not aid.startswith("HTTN") or prior.get("encoderVersion") == EFFECT_ENCODER_VERSION
        if args.force or not (encoder_current and destination.exists() and prior.get("sourceSHA256") == source_hash and prior.get("matteSHA256") == matte_hash and prior.get("sha256") == sha(destination)):
            print(f"{aid}: encoding native {width}x{height}", flush=True)
            reconstruction = encode(asset, source, width, height, frames, destination)
            if destination.stat().st_size >= 25 * 1024 * 1024:
                raise RuntimeError(f"Cloudflare Pages asset limit: {destination}")
            actual = probe(destination)["streams"][0]
            assert actual["width"] == 2*width and actual["height"] == height and int(actual["nb_frames"]) == frames
            matte_ssim, color_ssim = compare(asset, source, destination, width, height)
            prior = {"id": aid, "url": f"/videos/ar/packed/native-v3/{aid}.mp4", "sha256": sha(destination), "sourceUrl": asset["previewVideoUrl"], "sourceSHA256": source_hash, "matteUrl": asset["alphaVideoUrl"], "matteSHA256": matte_hash, "dimensions": [width, height], "frames": frames, "bytes": destination.stat().st_size, "matteSSIM": matte_ssim, "sourceColorSSIM": color_ssim, "sourceReconstructionMAE": reconstruction}
            if aid.startswith("HTTN"):
                prior["encoderVersion"] = EFFECT_ENCODER_VERSION
            report_path.write_text(json.dumps(prior, indent=2)+"\n")
        print(f"{aid}: verified {prior['dimensions']}, {prior['bytes']:,} bytes, matte SSIM {prior['matteSSIM']}", flush=True)
    if args.publish:
        reports = [json.loads((AUDIT / f"{a['id']}.json").read_text()) for a in eligible]
        baseline = json.loads((ROOT / "docs/qa/ar-media-detail-v2.json").read_text())
        for report in reports:
            assert sha(PUBLIC / report["url"].lstrip("/")) == report["sha256"]
            asset = next(a for a in assets if a["id"] == report["id"])
            asset["compatiblePackedVideoUrl"] = next(a for a in baseline["assets"] if a["id"] == report["id"])["files"]["packedVideoUrl"]["url"]
            asset["packedVideoUrl"] = report["url"]
            asset["packedQualityVersion"] = "native-v3"
            profiles[report["id"]]["packedVideoUrl"] = report["url"]
            profiles[report["id"]]["compatiblePackedVideoUrl"] = asset["compatiblePackedVideoUrl"]
        certificate = {"version": "native-v3", "date": "2026-11-03", "limits": ["H.264 CRF 12/14/18 is not mathematically lossless.", "Object mattes retain certified v2 edge resolution; native RGB adds detail without inventing new matte edges.", "Effects retain intentional light transparency. Real phone performance requires device testing."], "assets": reports}
        (ROOT / "docs/qa/ar-native-packed-v3.json").write_text(json.dumps(certificate, indent=2)+"\n")
        manifest_path.write_text(json.dumps(assets, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
        profiles_path.write_text(json.dumps(profiles, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
        print(f"Published {len(reports)} native-resolution packed clips", flush=True)


if __name__ == "__main__":
    main()
