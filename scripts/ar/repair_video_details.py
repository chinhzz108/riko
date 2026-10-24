"""Rebuild AR media from the RGB originals without translucent solid subjects.

Do not use a saliency model as an opacity map: supporting objects are not
necessarily salient. Preserve opaque interiors; isolate only verified backdrops.
Natural scenes that have no separable backdrop retain their complete RGB frame.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
from pathlib import Path

import resource_budget
import cv2
import numpy as np

cv2.setNumThreads(1)

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
MEDIA = PUBLIC / "videos/ar"
WORK = ROOT / "tmp/ar-detail-audit"
FPS = 24
SCENES = {"HTTN02", "HTTN03", "HTTN04", "HTTN05", "HTTN06", "HTTN08", "HTTN09", "HTTN10", "HTTN11", "HTTN12", "HTTN14"}
GLOWS = {"HTTN07", "HTTN13", "HTTN15"}
WHITE_DETAILS = {"DV03", "DV09", "DV10"}
OPEN_STRUCTURES = {"GT04", "GT05", "GT09", "DV05", "DV07", "DV09"}


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=width,height,nb_frames,r_frame_rate:format=duration", "-of", "json", str(path),
    ], text=True))


def frame_pipe(path, width, height, *, alpha=False, trim=0):
    return subprocess.Popen([
        "ffmpeg", "-v", "error", "-threads", "1", *(["-ss", str(trim)] if trim else []),
        *(["-c:v", "libvpx-vp9"] if alpha else []), "-i", str(path),
        "-vf", f"fps={FPS},scale={width}:{height}:flags=lanczos", "-an", "-frames:v", "240",
        "-f", "rawvideo", "-pix_fmt", "rgba" if alpha else "rgb24", "pipe:1",
    ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)


def read_frame(pipe, width, height, channels):
    data = pipe.stdout.read(width * height * channels)
    if not data:
        return None
    if len(data) != width * height * channels:
        raise RuntimeError("Truncated decoded frame")
    return np.frombuffer(data, np.uint8).reshape(height, width, channels).copy()


def fill_holes(binary):
    inverse = cv2.copyMakeBorder(255 - binary, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
    cv2.floodFill(inverse, None, (0, 0), 0)
    return np.maximum(binary, inverse[1:-1, 1:-1])


class DetailMatte:
    def __init__(self, width, height):
        self.width, self.height = width, height
        self.small_width = min(704, width)
        self.small_height = round(height * self.small_width / width)
        h, w = self.small_height, self.small_width
        yy, xx = np.mgrid[-1:1:complex(h), -1:1:complex(w)]
        self.design = np.stack([np.ones((h, w)), xx, yy, xx*xx, yy*yy, xx*yy], axis=-1)
        self.border = np.zeros((h, w), bool)
        self.border[:12] = self.border[-12:] = True
        self.border[:, :12] = self.border[:, -12:] = True

    def opaque(self, asset_id, rgb, previous):
        h, w = self.small_height, self.small_width
        image = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA)
        old = cv2.resize(previous, (w, h), interpolation=cv2.INTER_LINEAR)
        if asset_id in WHITE_DETAILS:
            # Fit the actual neutral studio backdrop. Do not key all white pixels:
            # white petals and bright interior paint belong to the foreground.
            neutral = (image.max(2).astype(float) - image.min(2) < 14) & (image.min(2) > 175)
            sample = self.border & neutral & (old < 20)
            x, y = self.design[sample][::3], image[sample][::3].astype(float)
            if len(x) < 12:
                background = np.full_like(image, 255, dtype=float)
            else:
                for _ in range(3):
                    coefficient = np.linalg.lstsq(x, y, rcond=None)[0]
                    error = np.abs(x @ coefficient - y).max(1)
                    valid = error < max(3, np.quantile(error, .8))
                    x, y = x[valid], y[valid]
                background = np.clip(self.design @ coefficient, 0, 255)
            distance = np.abs(image.astype(float) - background).max(2)
            binary = ((distance > 8) & (image.min(2) < 244)).astype(np.uint8) * 255
            binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
            binary = fill_holes(binary)
            binary = np.maximum(binary, (old > 100).astype(np.uint8) * 255)
        else:
            # The old model can locate the object, but its confidence is NOT opacity.
            # Restore dark/saturated details (glass, spokes, rails) directly from RGB.
            strong_detail = image.min(2) < (205 if asset_id == "GT07" else 185)
            binary = ((old > 26) | strong_detail).astype(np.uint8) * 255
            if asset_id not in OPEN_STRUCTURES:
                binary = fill_holes(binary)
            if asset_id in {"DV06", "DV08"}:
                # These dark animals/supports have no white-painted body parts.
                # The old alpha contains a faint floor/reflection, not anatomy.
                weak_studio_white = (image.min(2) > 215) & ((image.max(2).astype(float)-image.min(2)) < 18)
                binary[weak_studio_white] = 0
                binary = fill_holes(binary)
            if asset_id in {"GT05", "DV06", "DV08"}:
                # Do not turn faint white floor/compression specks into opaque
                # floating strips while restoring the bicycle's thin spokes.
                count, labels = cv2.connectedComponents(binary)
                support = (strong_detail | (old > 230)).astype(np.uint8)
                supported = np.bincount(labels.ravel(), weights=support.ravel(), minlength=count) > 1
                supported[0] = False
                binary = supported[labels].astype(np.uint8) * 255
        # One subpixel antialias band, not a soft mask across the subject's body.
        mask = cv2.resize(binary, (self.width, self.height), interpolation=cv2.INTER_LINEAR)
        return cv2.GaussianBlur(mask, (0, 0), .35)

    def effect(self, asset_id, rgb):
        if asset_id in SCENES:
            return rgb, np.full(rgb.shape[:2], 255, np.uint8)
        pixels = rgb.astype(np.float32) / 255
        if asset_id in GLOWS:
            # Black-backed light is already composited/premultiplied in the source.
            # Unassociate its RGB before applying alpha, avoiding C * alpha twice.
            alpha = pixels.max(2)
            alpha[alpha < 2 / 255] = 0
            foreground = np.divide(pixels, alpha[..., None], out=np.zeros_like(pixels), where=alpha[..., None] > 0)
            return np.clip(foreground * 255, 0, 255).astype(np.uint8), np.clip(alpha * 255, 0, 255).astype(np.uint8)
        if asset_id == "HTTN14":
            mask = (pixels.max(2) > .08).astype(np.uint8) * 255
            mask = fill_holes(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)))
            return rgb, cv2.GaussianBlur(mask, (0, 0), .45)
        # Rainbow / tornado were rendered on white. Preserve colored bands and
        # cloud detail; only remove the known white backdrop.
        alpha = np.clip((1 - pixels.min(2)) * 16, 0, 1)
        foreground = np.divide(pixels - (1-alpha[..., None]), alpha[..., None], out=np.zeros_like(pixels), where=alpha[..., None] > 0)
        return np.clip(foreground * 255, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)


def output_paths(asset_id):
    return {
        "alphaVideoUrl": f"/videos/ar/hq2/{asset_id}.webm",
        "alphaColorUrl": f"/videos/ar/fallback/hq2/{asset_id}-color.mp4",
        "alphaMaskUrl": f"/videos/ar/fallback/hq2/{asset_id}-alpha.mp4",
        "packedVideoUrl": f"/videos/ar/packed/hq2/{asset_id}.mp4",
    }


def encode_raw(raw_path, source, width, height, frame_count, routes):
    for route in routes.values():
        (PUBLIC / route.lstrip("/")).parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-v", "error", "-y", "-threads", "1", "-f", "rawvideo", "-pix_fmt", "rgba",
        "-s", f"{width}x{height}", "-r", str(FPS), "-i", str(raw_path), "-i", str(source),
        "-filter_complex", "[0:v]split=4[webm][color][mask][pack];[mask]alphaextract,format=yuv420p[m];[pack]split[pc][pa];[pc]format=yuv420p[c];[pa]alphaextract,format=yuv420p[a];[c][a]hstack=inputs=2[p]",
        "-map", "[webm]", "-map", "1:a?", "-frames:v", str(frame_count), "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1", "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-threads", "3", "-crf", "20", "-b:v", "0", "-c:a", "libopus", "-b:a", "96k", str(PUBLIC / routes["alphaVideoUrl"].lstrip("/")),
        "-map", "[color]", "-map", "1:a?", "-frames:v", str(frame_count), "-c:v", "libx264", "-threads", "1", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(PUBLIC / routes["alphaColorUrl"].lstrip("/")),
        "-map", "[m]", "-an", "-frames:v", str(frame_count), "-c:v", "libx264", "-threads", "1", "-preset", "fast", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(PUBLIC / routes["alphaMaskUrl"].lstrip("/")),
        "-map", "[p]", "-map", "1:a?", "-frames:v", str(frame_count), "-c:v", "libx264", "-threads", "2", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(PUBLIC / routes["packedVideoUrl"].lstrip("/")),
    ]
    subprocess.run(command, check=True)
    for route in routes.values():
        size = (PUBLIC / route.lstrip("/")).stat().st_size
        if size >= 25 * 1024 * 1024:
            raise RuntimeError(f"Pages asset limit exceeded: {route}, {size}")


def repair_asset(asset, force=False, raw_only=False):
    aid = asset["id"]
    routes = output_paths(aid)
    report_path = WORK / f"{aid}-repair.json"
    if not force and report_path.is_file() and (not raw_only or (WORK / f"{aid}.rgba").is_file()) and all((PUBLIC / p.lstrip("/")).is_file() for p in routes.values()):
        return json.loads(report_path.read_text())
    if aid == "RIKO":
        # Preserve the already-verified mascot; it is not a saliency-masked asset.
        source = MEDIA / "RIKO.webm"
        info = probe(source)["streams"][0]
        width, height = info["width"], info["height"]
        decoder = frame_pipe(source, width, height, alpha=True)
        old_decoder = None
    else:
        matches = list((ROOT / "MAM_BOOK_AR/AUDIO_DELIVERY/MP4").glob(f"{aid}-*.mp4"))
        if len(matches) != 1:
            raise RuntimeError(f"No unique RGB original for {aid}")
        source = matches[0]
        info = probe(source)["streams"][0]
        scale = min(1, 960 / max(info["width"], info["height"]))
        width, height = max(2, int(info["width"]*scale)//2*2), max(2, int(info["height"]*scale)//2*2)
        decoder = frame_pipe(source, width, height)
        # Always refer to the old stable URL, never a previously repaired mask.
        old_decoder = frame_pipe(MEDIA / f"{aid}.webm", width, height, alpha=True) if not aid.startswith("HTTN") else None
    matte = DetailMatte(width, height)
    raw = WORK / f"{aid}.rgba"
    stats, bounds = [], [width, height, 0, 0]
    try:
        with raw.open("wb") as handle:
            for index in range(240):
                decoded = read_frame(decoder, width, height, 4 if aid == "RIKO" else 3)
                if decoded is None:
                    break
                original = decoded[:, :, :3].copy()
                if aid == "RIKO":
                    rgb, alpha = original, decoded[:, :, 3]
                elif aid.startswith("HTTN"):
                    rgb, alpha = matte.effect(aid, original)
                else:
                    old_frame = read_frame(old_decoder, width, height, 4)
                    if old_frame is None:
                        raise RuntimeError(f"Missing reference mask frame {aid}:{index}")
                    rgb, alpha = original, matte.opaque(aid, original, old_frame[:, :, 3])
                rgba = np.dstack([rgb, alpha])
                handle.write(rgba.tobytes())
                ys, xs = np.nonzero(alpha > 2)
                if len(xs):
                    bounds = [min(bounds[0], int(xs.min())), min(bounds[1], int(ys.min())), max(bounds[2], int(xs.max()+1)), max(bounds[3], int(ys.max()+1))]
                opaque = alpha > 250
                visible = alpha > 10
                stats.append({"frame": index, "visible": int(visible.sum()), "opaque": int(opaque.sum()), "partial": int(((alpha > 10)&(alpha < 245)).sum())})
                if index in [24, 96, 192]:
                    cv2.imwrite(str(WORK / f"{aid}-{index}-new.png"), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
                    cv2.imwrite(str(WORK / f"{aid}-{index}-source.png"), cv2.cvtColor(original, cv2.COLOR_RGB2BGR))
    finally:
        decoder.stdout.close()
        decoder.terminate()
        decoder.wait()
        if old_decoder:
            old_decoder.stdout.close()
            old_decoder.terminate()
            old_decoder.wait()
    mode = "scene" if aid in SCENES else "glow" if aid in GLOWS else "cutout"
    if len(stats) < 200:
        raise RuntimeError(f"Incomplete repaired clip {aid}: {len(stats)} frames")
    print(f"[{aid}] {len(stats)} frames, {width}x{height}, {mode}; encoding", flush=True)
    if not raw_only:
        encode_raw(raw, source, width, height, len(stats), routes)
    result = {"id": aid, **routes, "frames": len(stats), "width": width, "height": height,
        "presentationMode": mode, "boundsPixels": bounds, "frameStats": stats,
        "method": "original-scene" if aid in SCENES else "unassociated-glow" if aid in GLOWS else "preserved-alpha" if aid == "RIKO" else "opaque-detail-matte"}
    report_path.write_text(json.dumps(result, indent=2))
    print(f"[{aid}] encoded, packed={int((PUBLIC / routes['packedVideoUrl'].lstrip('/')).stat().st_size/1024)} KiB", flush=True)
    return result


def contain(frame, width=960, height=540):
    h, w = frame.shape[:2]
    ratio = min(width/w, height/h)
    nw, nh = round(w*ratio), round(h*ratio)
    resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LANCZOS4)
    canvas = np.zeros((height, width, frame.shape[2]), np.uint8)
    if frame.shape[2] == 3:
        canvas[:] = (255, 254, 242)
    x, y = (width-nw)//2, (height-nh)//2
    canvas[y:y+nh, x:x+nw] = resized
    return canvas


def has_audio(path):
    return bool(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)], text=True).strip())


def encode_preview(raw, path, width, height, frames, *, rgba=False, audio_source=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba" if rgba else "rgb24", "-s", f"{width}x{height}", "-r", str(FPS), "-i", str(raw)]
    if audio_source:
        command += ["-i", str(audio_source)]
    if rgba:
        command += ["-filter_complex", "[0:v]split[fg][base];[base]lutrgb=r=255:g=254:b=242,format=rgb24[bg];[bg][fg]overlay=shortest=1[out]", "-map", "[out]"]
    elif audio_source:
        command += ["-map", "0:v"]
    command += ["-map", "1:a?", "-c:a", "aac", "-b:a", "96k"] if audio_source else ["-an"]
    command += ["-frames:v", str(frames), "-c:v", "libx264", "-threads", "2", "-crf", "16", "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)]
    subprocess.run(command, check=True)


def build_recaps(manifest, force_ids=()):
    by_id = {asset["id"]: asset for asset in manifest}
    for asset in manifest:
        if not asset["id"].startswith("RECAP_"):
            continue
        aid = asset["id"]
        report_path = WORK / f"{aid}-repair.json"
        routes = output_paths(aid)
        if aid not in force_ids and report_path.is_file() and all((PUBLIC / route.lstrip("/")).is_file() for route in routes.values()):
            continue
        raw, preview_raw = WORK / f"{aid}.rgba", WORK / f"{aid}-preview.rgb"
        frames = 0
        with raw.open("wb") as handle, preview_raw.open("wb") as preview_handle:
            for source_id in asset["targets"]:
                report = repair_asset(by_id[source_id], raw_only=True)
                source_raw = np.memmap(WORK / f"{source_id}.rgba", dtype=np.uint8, mode="r", shape=(report["frames"], report["height"], report["width"], 4))
                original = next((ROOT / "MAM_BOOK_AR/AUDIO_DELIVERY/MP4").glob(f"{source_id}-*.mp4"))
                camera = cv2.VideoCapture(str(original))
                camera.set(cv2.CAP_PROP_POS_FRAMES, 10)
                for i in range(10, 38):
                    handle.write(contain(source_raw[i]).tobytes())
                    ok, bgr = camera.read()
                    if not ok:
                        raise RuntimeError(f"Original recap frame missing: {source_id}:{i}")
                    preview_handle.write(contain(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).tobytes())
                    frames += 1
                camera.release()
                del source_raw
        # Recaps deliberately have no speech track, matching their previous behavior.
        silent = WORK / "silent.mp4"
        if not silent.is_file():
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=16x16:r=24:d=1", "-an", str(silent)], check=True)
        print(f"[{aid}] encoding {frames} frames from lossless repaired page masters", flush=True)
        encode_raw(raw, silent, 960, 540, frames, routes)
        preview_route = f"/videos/ar/original/hq2/{aid}.mp4"
        encode_preview(preview_raw, PUBLIC / preview_route.lstrip("/"), 960, 540, frames)
        preview_raw.unlink()
        result = {"id": aid, **routes, "previewVideoUrl": preview_route, "frames": frames, "width": 960, "height": 540,
            "presentationMode": "mixed", "method": "lossless-master-recap", "boundsPixels": [0, 0, 960, 540]}
        report_path.write_text(json.dumps(result, indent=2))


def publish(manifest):
    profiles = json.loads((ROOT / "src/data/arVideoPresentation.json").read_text())
    for asset in manifest:
        aid = asset["id"]
        report = json.loads((WORK / f"{aid}-repair.json").read_text())
        if aid in GLOWS:
            report["presentationMode"] = "glow"
        if not aid.startswith("RECAP_"):
            preview_route = f"/videos/ar/original/hq2/{aid}.mp4"
            preview = PUBLIC / preview_route.lstrip("/")
            preview.parent.mkdir(parents=True, exist_ok=True)
            if aid == "RIKO":
                if not preview.is_file() or not has_audio(preview):
                    repair_asset(asset, raw_only=True)
                    encode_preview(WORK / f"{aid}.rgba", preview, report["width"], report["height"], report["frames"], rgba=True, audio_source=MEDIA / "RIKO.webm")
            else:
                original = next((ROOT / "MAM_BOOK_AR/AUDIO_DELIVERY/MP4").glob(f"{aid}-*.mp4"))
                shutil.copy2(original, preview)
            report["previewVideoUrl"] = preview_route
        asset.update({key: report[key] for key in ["alphaVideoUrl", "alphaColorUrl", "alphaMaskUrl", "packedVideoUrl", "previewVideoUrl", "presentationMode"]})
        asset["qualityVersion"] = "detail-preserved-v2"
        asset["alphaBytes"] = (PUBLIC / asset["alphaVideoUrl"].lstrip("/")).stat().st_size
        asset["fallbackBytes"] = sum((PUBLIC / asset[key].lstrip("/")).stat().st_size for key in ["alphaColorUrl", "alphaMaskUrl"])
        w, h = report["width"], report["height"]
        l, t, r, b = report["boundsPixels"]
        # Include even faint effects and supports; never crop to a saliency box.
        profiles[aid].update({"bounds": {"left": max(0, l/w-.02), "top": max(0, t/h-.02), "right": min(1, r/w+.02), "bottom": min(1, b/h+.02)},
            "mode": report["presentationMode"], "measuredFrames": report["frames"], "packedVideoUrl": report["packedVideoUrl"], "previewVideoUrl": report["previewVideoUrl"]})
        if report["presentationMode"] in {"scene", "mixed"}:
            profiles[aid]["bounds"] = {"left": 0, "top": 0, "right": 1, "bottom": 1}
        if report["presentationMode"] in {"scene", "glow", "mixed"}:
            profiles[aid]["grounded"] = False
    (MEDIA / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    (ROOT / "src/data/arVideoPresentation.json").write_text(json.dumps(profiles, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    print(f"Published {len(manifest)} repaired assets with versioned URLs", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--force-recaps", nargs="*", default=[])
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((MEDIA / "manifest.json").read_text())
    for asset in manifest:
        if asset["id"].startswith("RECAP_") or (args.ids and asset["id"] not in args.ids):
            continue
        repair_asset(asset, args.force)
    if args.publish:
        build_recaps(manifest, args.force_recaps)
        publish(manifest)


if __name__ == "__main__":
    main()
