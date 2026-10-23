#!/usr/bin/env python3
"""Create transparent AR clips for the white-background object videos."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "tmp/models/u2netp.onnx"
SOURCE_DIR = ROOT / "MAM_BOOK_AR/AUDIO_DELIVERY/MP4"
OUTPUT_DIR = ROOT / "public/videos/ar"
FALLBACK_DIR = OUTPUT_DIR / "fallback"
MANIFEST = OUTPUT_DIR / "manifest.json"
ASSET_IDS = {
    "DV02", "DV03", "DV04", "DV05", "DV07", "DV08", "DV09", "DV10",
    "GT01", "GT03", "GT04", "GT06", "GT07", "GT08",
    "HTTN02", "HTTN04", "HTTN05", "HTTN06", "HTTN08", "HTTN09",
    "HTTN10", "HTTN11", "HTTN14",
}
INPUT_SIZE = 320
OUTPUT_WIDTH = 720
OUTPUT_FPS = 24


def make_session():
    if not MODEL.is_file():
        raise FileNotFoundError(f"Download the official rembg u2netp.onnx model into {MODEL}")
    return ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])


def predict_alpha(session: ort.InferenceSession, frame: np.ndarray, output_size: tuple[int, int]) -> np.ndarray:
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    small = Image.fromarray(rgb).resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.LANCZOS)
    values = np.asarray(small, dtype=np.float32) / 255.0
    values = (values - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array(
        [0.229, 0.224, 0.225], dtype=np.float32
    )
    tensor = np.transpose(values, (2, 0, 1))[None, ...]
    prediction = session.run(None, {session.get_inputs()[0].name: tensor})[0][0, 0]
    low, high = float(prediction.min()), float(prediction.max())
    if high - low < 1e-6:
        raise RuntimeError("U2Netp returned a blank foreground mask")
    prediction = np.clip((prediction - low) / (high - low), 0.0, 1.0)
    # Keep the model's soft edge while suppressing low-confidence white backdrop.
    prediction = np.clip((prediction - 0.035) / 0.90, 0.0, 1.0)
    alpha = cv2.resize(prediction, output_size, interpolation=cv2.INTER_CUBIC)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.55)
    return np.clip(alpha * 255.0, 0, 255).astype(np.uint8)


def source_for(asset_id: str) -> Path:
    matches = sorted(SOURCE_DIR.glob(f"{asset_id}-*.mp4"))
    if len(matches) != 1:
        raise FileNotFoundError(f"Expected one audio-bearing MP4 for {asset_id}; found {matches}")
    return matches[0]


def ffmpeg_executable() -> str:
    import shutil

    executable = shutil.which("ffmpeg")
    if not executable:
        raise FileNotFoundError("FFmpeg was not found on PATH")
    return executable


def make_safari_fallbacks(ffmpeg: str, asset_id: str, webm: Path) -> None:
    color = FALLBACK_DIR / f"{asset_id}-color.mp4"
    matte = FALLBACK_DIR / f"{asset_id}-alpha.mp4"
    decode_args = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-c:v", "libvpx-vp9", "-i", str(webm)]
    subprocess.run(decode_args + [
        "-filter_complex", "[0:v]format=yuv420p[v]", "-map", "[v]", "-map", "0:a?", "-c:v", "libx264",
        "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart", str(color),
    ], check=True)
    subprocess.run(decode_args + [
        "-filter_complex", "[0:v]alphaextract,format=gray,format=yuv420p[v]", "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(matte),
    ], check=True)


def make_webm(session: ort.InferenceSession, ffmpeg: str, asset_id: str, source: Path, force: bool) -> None:
    webm = OUTPUT_DIR / f"{asset_id}.webm"
    color = FALLBACK_DIR / f"{asset_id}-color.mp4"
    matte = FALLBACK_DIR / f"{asset_id}-alpha.mp4"
    if not force and all(path.is_file() and path.stat().st_size > 0 for path in (webm, color, matte)):
        return

    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        raise RuntimeError(f"Could not decode {source}")
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = cap.get(cv2.CAP_PROP_FPS) or OUTPUT_FPS
    scale = min(1.0, OUTPUT_WIDTH / max(source_width, source_height))
    out_width = max(2, int(source_width * scale) // 2 * 2)
    out_height = max(2, int(source_height * scale) // 2 * 2)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / source_fps if frame_count else 10.0
    output_count = max(1, round(duration * OUTPUT_FPS))
    raw_path = ROOT / "tmp/ar-alpha-work" / f"{asset_id}.rgba"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    last_alpha: np.ndarray | None = None
    pending_rgb: np.ndarray | None = None
    pending_index: int | None = None
    written = 0
    index = 0

    def write_rgba(raw_file, rgb: np.ndarray, alpha: np.ndarray) -> None:
        nonlocal written
        rgba = np.empty((out_height, out_width, 4), dtype=np.uint8)
        rgba[:, :, :3] = rgb
        rgba[:, :, 3] = alpha
        raw_file.write(rgba.tobytes())
        written += 1

    try:
        with raw_path.open("wb") as raw_file:
            while index < output_count:
                ok, frame = cap.read()
                if not ok:
                    break
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                if (out_width, out_height) != (source_width, source_height):
                    rgb = cv2.resize(rgb, (out_width, out_height), interpolation=cv2.INTER_AREA)

                if index % 2 == 0 or last_alpha is None:
                    current_alpha = predict_alpha(session, frame, (out_width, out_height))
                    if pending_rgb is not None and pending_index is not None:
                        blended = cv2.addWeighted(last_alpha, 0.5, current_alpha, 0.5, 0)
                        write_rgba(raw_file, pending_rgb, blended)
                        pending_rgb = None
                        pending_index = None
                    write_rgba(raw_file, rgb, current_alpha)
                    last_alpha = current_alpha
                else:
                    pending_rgb = rgb
                    pending_index = index
                index += 1
                if written and written % 48 == 0:
                    print(f"  {asset_id}: {written}/{output_count} frames", flush=True)

            if pending_rgb is not None and last_alpha is not None:
                write_rgba(raw_file, pending_rgb, last_alpha)
    finally:
        cap.release()

    if written < max(1, output_count - 2):
        raise RuntimeError(f"Only encoded {written}/{output_count} frames for {asset_id}")

    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{out_width}x{out_height}",
        "-r", str(OUTPUT_FPS), "-i", str(raw_path), "-i", str(source),
        "-map", "0:v:0", "-map", "1:a?", "-frames:v", str(written),
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
        "-metadata:s:v:0", "alpha_mode=1", "-deadline", "good", "-cpu-used", "6",
        "-row-mt", "1", "-crf", "32", "-b:v", "0", "-c:a", "libopus", "-b:a", "96k",
        str(webm),
    ]
    subprocess.run(command, check=True)
    raw_path.unlink(missing_ok=True)
    make_safari_fallbacks(ffmpeg, asset_id, webm)


def update_manifest() -> None:
    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for entry in entries:
        if entry["id"] not in ASSET_IDS:
            continue
        entry.update({
            "alpha": True,
            "alphaVideoUrl": entry["url"],
            "alphaColorUrl": f"/videos/ar/fallback/{entry['id']}-color.mp4",
            "alphaMaskUrl": f"/videos/ar/fallback/{entry['id']}-alpha.mp4",
        })
    MANIFEST.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    force = "--force" in sys.argv
    ffmpeg = ffmpeg_executable()
    FALLBACK_DIR.mkdir(parents=True, exist_ok=True)
    if "--fallback-only" in sys.argv:
        for asset_id in sorted(ASSET_IDS):
            make_safari_fallbacks(ffmpeg, asset_id, OUTPUT_DIR / f"{asset_id}.webm")
            print(f"[Safari fallback] {asset_id}", flush=True)
        update_manifest()
        return

    session = make_session()
    for asset_id in sorted(ASSET_IDS):
        source = source_for(asset_id)
        make_webm(session, ffmpeg, asset_id, source, force)
        print(f"[transparent] {asset_id}: {source.name}", flush=True)
    update_manifest()


if __name__ == "__main__":
    main()
