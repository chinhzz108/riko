"""Decode delivered replacements and their fallbacks; save composites for review.

Offline QA only. This does not test browser codecs or physical-phone playback.
"""
import hashlib
import argparse
import json
import subprocess
from pathlib import Path

import resource_budget
import cv2
import numpy as np
from PIL import Image, ImageDraw

from build_reviewed_remakes import decoder, matte, read_frame, sha

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
OUT = ROOT / "output/qa/reviewed-remakes-v4"
OUT.mkdir(parents=True, exist_ok=True)
cv2.setNumThreads(1)


def audio_hash(path):
    data = subprocess.check_output([
        "ffmpeg", "-v", "error", "-threads", "1", "-i", str(path),
        "-t", "10", "-map", "0:a:0", "-c:a", "copy", "-f", "adts", "pipe:1",
    ])
    return hashlib.sha256(data).hexdigest()


def verify(asset):
    aid = asset["id"]
    files = {key: PUBLIC / value["url"].lstrip("/") for key, value in asset["files"].items()}
    source = PUBLIC / asset.get("sourceReferenceUrl", asset["files"]["previewVideoUrl"]["url"]).lstrip("/")
    width, height = asset["files"]["previewVideoUrl"]["dimensions"]
    cw, ch = asset["files"]["compatiblePackedVideoUrl"]["dimensions"]
    streams = {
        "source": (source, width, height),
        "packed": (files["packedVideoUrl"], width * 2, height),
        "compatible": (files["compatiblePackedVideoUrl"], cw, ch),
        "color": (files["alphaColorUrl"], width, height),
        "mask": (files["alphaMaskUrl"], width, height),
    }
    if aid == "HTTN12":
        streams["preview"] = (files["previewVideoUrl"], width, height)
    pipes = {key: decoder(path, w, h) for key, (path, w, h) in streams.items()}
    errors = {key: [] for key in ["sourceOpaqueRGBMAE", "sourceBlackCompositeMAE",
                                  "compatibleCompositeMAE", "splitFallbackCompositeMAE"]}
    if aid == "HTTN12":
        errors["flatPreviewBlackCompositeMAE"] = []
    samples = []
    sample_indices = [0, 24, 72, 120, 168, 216, 239]
    try:
        for i in range(asset["frames"]):
            frames = {key: read_frame(pipes[key], w, h, 3)
                      for key, (_, w, h) in streams.items()}
            assert all(value is not None for value in frames.values()), f"{aid}: truncated frame {i}"
            rgb = frames["source"]
            _, expected_alpha = matte(rgb, aid)
            packed = frames["packed"]
            color = packed[:, :width].astype(np.float32) / 255
            alpha = packed[:, width:, 1].astype(np.float32) / 255
            if aid == "HTTN12":
                errors["flatPreviewBlackCompositeMAE"].append(float(np.abs(
                    frames["preview"].astype(np.float32)/255 - color*alpha[..., None]).mean()))
            foreground = cv2.erode(np.uint8(expected_alpha == 255), np.ones((5, 5), np.uint8)) > 0
            if aid == "HTTN12":
                assert foreground.sum() > width * height * .1, "Tide must retain an opaque interior"
                errors["sourceOpaqueRGBMAE"].append(float(np.abs(color[foreground] - rgb[foreground] / 255).mean()))
            else:
                errors["sourceBlackCompositeMAE"].append(float(np.abs(color * alpha[..., None] - rgb / 255).mean()))
            small = frames["compatible"]
            small_color = small[:, :cw//2].astype(np.float32) / 255
            small_alpha = small[:, cw//2:, 1].astype(np.float32) / 255
            split_color = frames["color"].astype(np.float32) / 255
            split_alpha = frames["mask"][:, :, 1].astype(np.float32) / 255
            small_errors, split_errors = [], []
            for bg in [0., .5, 1.]:
                composite = color * alpha[..., None] + bg * (1 - alpha[..., None])
                small_wanted = cv2.resize(composite, (cw//2, ch), interpolation=cv2.INTER_AREA)
                small_actual = small_color * small_alpha[..., None] + bg * (1 - small_alpha[..., None])
                small_errors.append(float(np.abs(small_actual - small_wanted).mean()))
                split_actual = split_color * split_alpha[..., None] + bg * (1 - split_alpha[..., None])
                split_errors.append(float(np.abs(split_actual - composite).mean()))
            errors["compatibleCompositeMAE"].append(max(small_errors))
            errors["splitFallbackCompositeMAE"].append(max(split_errors))
            if i in sample_indices:
                samples.append((i, color.copy(), alpha.copy()))
            if i % 60 == 59:
                print(f"{aid}: source/fallback decoded {i+1}/240", flush=True)
        for key, pipe in pipes.items():
            assert pipe.stdout.read(1) == b"", f"{aid}: extra {key} frames"
            assert pipe.wait() == 0, f"{aid}: {key} decode error"
    finally:
        for pipe in pipes.values():
            pipe.stdout.close()
            if pipe.poll() is None:
                pipe.terminate()
                pipe.wait()
    checks = {key: {"mean": float(np.mean(values)), "worst": max(values)}
              for key, values in errors.items() if values}
    for key, values in checks.items():
        assert values["worst"] < .03, f"{aid}: {key}: {values}"
    narration = PUBLIC / asset["narrationSourceUrl"].lstrip("/")
    expected_audio = audio_hash(narration)
    audio = {key: audio_hash(files[key]) for key in
             ["previewVideoUrl", "packedVideoUrl", "compatiblePackedVideoUrl", "alphaColorUrl"]}
    assert all(value == expected_audio for value in audio.values()), f"{aid}: narration changed"
    # Decode the transcoded Opus narration too; it cannot be byte-identical AAC.
    subprocess.run(["ffmpeg", "-v", "error", "-threads", "1", "-c:v", "libvpx-vp9",
                    "-i", str(files["alphaVideoUrl"]), "-f", "null", "-"], check=True)
    sheet = Image.new("RGB", (1200, len(samples) * 250), "#18212d")
    draw = ImageDraw.Draw(sheet)
    for row, (i, color, alpha) in enumerate(samples):
        for col, bg in enumerate([(0.04, .04, .04), (.2, .5, .7), (.9, .9, .9)]):
            composite = color * alpha[..., None] + np.array(bg) * (1-alpha[..., None])
            tile = Image.fromarray(np.uint8(np.clip(composite * 255, 0, 255))).resize((400, 226))
            sheet.paste(tile, (col * 400, row * 250 + 24))
            draw.text((col * 400 + 8, row * 250 + 6), f"{aid} | {i/24:.2f}s | decoded packed", fill="white")
    preview = OUT / f"{aid}-delivered-composites.jpg"
    sheet.save(preview, quality=92)
    return {"id": aid, "framesPerStream": asset["frames"], "decodedVideoStreams": len(streams) + 1,
            "files": {key: {"url": value["url"], "sha256": sha(files[key])}
                      for key, value in asset["files"].items()},
            "checks": checks, "aacNarrationSHA256": expected_audio,
            "aacNarrationMatches": list(audio), "browserTested": False, "phoneTested": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", choices=["HTTN12", "HTTN13"])
    args = parser.parse_args()
    certificate = json.loads((ROOT / "docs/qa/ar-reviewed-remakes-v4.json").read_text())
    report_path = ROOT / "docs/qa/ar-reviewed-remakes-source-v4.json"
    retained = []
    if args.id:
        retained = [asset for asset in json.loads(report_path.read_text())["assets"] if asset["id"] != args.id]
    report = {"version": "remake-v4", "kind": "offline-source-and-fallback-decode",
              "assets": retained + [verify(asset) for asset in certificate["assets"] if not args.id or asset["id"] == args.id]}
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2), flush=True)
