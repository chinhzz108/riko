"""Build only the two reviewed replacement clips, preserving printed QR routes.

This is offline decode/matte QA, not a claim of physical-phone/browser testing.
The flood/earthquake candidates are intentionally excluded after visual review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import resource_budget
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
VERSION = "remake-v4"
FPS = 24
FRAMES = 240
cv2.setNumThreads(1)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ], text=True))


def matte(rgb, aid):
    f = rgb.astype(np.float32) / 255
    if aid == "HTTN13":
        alpha = f.max(2)
        alpha[alpha < 3 / 255] = 0
        color = np.divide(f, alpha[..., None], out=np.zeros_like(f), where=alpha[..., None] > 0)
        # Suppress only the faint clipped outermost light at the frame boundary.
        # Padding does not reconstruct rays missing from the generated source.
        rim = np.ones(alpha.shape, np.float32)
        for i in range(4):
            rim[i] *= i / 4; rim[-i-1] *= i / 4
            rim[:, i] *= i / 4; rim[:, -i-1] *= i / 4
        alpha *= rim
    else:
        excess = np.minimum(f[:, :, 0], f[:, :, 2]) - f[:, :, 1]
        alpha = 1 - np.clip((excess - .12) / .48, 0, 1)
        # Keep opaque rock/water interiors intact, including any interior tint.
        candidates = np.uint8(alpha < .999)
        count, labels = cv2.connectedComponents(candidates)
        edge_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
        connected = np.isin(labels, edge_labels[edge_labels != 0])
        alpha[~connected] = 1
        border = np.concatenate([f[:8].reshape(-1, 3), f[-8:].reshape(-1, 3)])
        background = np.median(border, axis=0)
        color = np.divide(f - (1 - alpha[..., None]) * background, alpha[..., None],
                          out=np.zeros_like(f), where=alpha[..., None] > .001)
    return np.uint8(np.clip(color * 255, 0, 255)), np.uint8(np.clip(alpha * 255, 0, 255))


def read_frame(pipe, width, height, channels):
    data = pipe.stdout.read(width * height * channels)
    if not data:
        return None
    if len(data) != width * height * channels:
        raise RuntimeError("Truncated decoded replacement frame")
    return np.frombuffer(data, np.uint8).reshape(height, width, channels)


def decoder(path, width, height, alpha=False):
    return subprocess.Popen([
        "ffmpeg", "-v", "error", "-threads", "1",
        *(["-c:v", "libvpx-vp9"] if alpha else []), "-i", str(path),
        "-f", "rawvideo", "-pix_fmt", "rgba" if alpha else "rgb24", "pipe:1"
    ], stdout=subprocess.PIPE)


def build(aid, incoming, asset, reuse_encoded=False):
    source = incoming / ("HTTN13_aurora_take1.mp4" if aid == "HTTN13" else "HTTN12_tides_take1_REPAIRED.mp4")
    expected_sha = {"HTTN13": "c11e3d1f9edfc57ee12249ed6caf0e0ee0dc392875561be4d530502a2f76821b",
                    "HTTN12": "2bc70bc998f4fdf6efd0ac9d819291e72c5aae35c03cf9dd69efbb4048a8b3d4"}
    assert sha(source) == expected_sha[aid], "New input requires a fresh review and immutable version"
    metadata = probe(source)
    video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    width, height = video["width"], video["height"]
    assert video["avg_frame_rate"] == "24/1" and int(video["nb_frames"]) == FRAMES
    narration = PUBLIC / f"videos/ar/original/hq2/{aid}.mp4"
    assert any(s["codec_type"] == "audio" for s in probe(narration)["streams"])
    routes = {
        "alphaVideoUrl": f"/videos/ar/{VERSION}/{aid}.webm",
        "alphaColorUrl": f"/videos/ar/fallback/{VERSION}/{aid}-color.mp4",
        "alphaMaskUrl": f"/videos/ar/fallback/{VERSION}/{aid}-alpha.mp4",
        "packedVideoUrl": f"/videos/ar/packed/{VERSION}/{aid}.mp4",
        "compatiblePackedVideoUrl": f"/videos/ar/packed/{VERSION}/{aid}-compatible.mp4",
        "previewVideoUrl": f"/videos/ar/original/{VERSION}/{aid}.mp4",
    }
    for route in routes.values():
        (PUBLIC / route.lstrip("/")).parent.mkdir(parents=True, exist_ok=True)
    run = ["ffmpeg", "-v", "error", "-y", "-threads", "1", "-filter_complex_threads", "1"]
    subprocess.run(run + ["-i", str(source), "-i", str(narration), "-map", "0:v:0", "-map", "1:a:0",
                         "-c", "copy", "-t", "10", "-movflags", "+faststart",
                         str(PUBLIC / routes["previewVideoUrl"].lstrip("/"))], check=True)
    graph = "[0:v]split=4[w][c][m][p];[m]alphaextract,format=yuv420p[mask];[c]format=yuv420p[color];[p]split[pc][pa];[pc]format=yuv420p[rgb];[pa]alphaextract,format=yuv420p[a];[rgb][a]hstack=inputs=2[packed];[packed]split[native][small];[small]scale=1920:-2:flags=lanczos[compatible]"
    command = run + ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}", "-r", str(FPS),
                     "-i", "pipe:0", "-i", str(narration), "-filter_complex", graph]
    command += ["-map", "[w]", "-map", "1:a:0", "-frames:v", str(FRAMES), "-c:v", "libvpx-vp9",
                "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1",
                "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-threads", "2", "-crf", "20", "-b:v", "0",
                "-c:a", "libopus", "-b:a", "96k", str(PUBLIC / routes["alphaVideoUrl"].lstrip("/"))]
    for key, label, crf in [("alphaColorUrl", "color", "14"), ("alphaMaskUrl", "mask", "10"),
                             ("packedVideoUrl", "native", "14"), ("compatiblePackedVideoUrl", "compatible", "16")]:
        command += ["-map", f"[{label}]"]
        command += ["-an"] if key == "alphaMaskUrl" else ["-map", "1:a:0", "-c:a", "copy"]
        command += ["-frames:v", str(FRAMES), "-c:v", "libx264", "-threads", "1", "-preset", "fast", "-crf", crf,
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(PUBLIC / routes[key].lstrip("/"))]
    reuse_encoded = reuse_encoded and all((PUBLIC / route.lstrip("/")).is_file() for route in routes.values())
    encoder = None if reuse_encoded else subprocess.Popen(command, stdin=subprocess.PIPE)
    cap = cv2.VideoCapture(str(source))
    bounds = [width, height, 0, 0]
    try:
        for i in range(FRAMES):
            ok, bgr = cap.read(); assert ok, f"Missing input frame {aid}:{i}"
            color, alpha = matte(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), aid)
            yy, xx = np.nonzero(alpha > 4)
            if len(xx):
                bounds = [min(bounds[0], int(xx.min())), min(bounds[1], int(yy.min())),
                          max(bounds[2], int(xx.max()+1)), max(bounds[3], int(yy.max()+1))]
            if encoder:
                encoder.stdin.write(np.dstack([color, alpha]).tobytes())
            if i % 60 == 59:
                print(f"{aid}: streamed {i+1}/{FRAMES} RGBA frames", flush=True)
        if encoder:
            encoder.stdin.close()
            assert encoder.wait() == 0
    finally:
        cap.release()
        if encoder and encoder.poll() is None:
            encoder.terminate(); encoder.wait()
    files = {}
    for key, route in routes.items():
        path = PUBLIC / route.lstrip("/")
        assert 0 < path.stat().st_size < 25 * 1024 * 1024
        info = probe(path)
        v = next(s for s in info["streams"] if s["codec_type"] == "video")
        assert int(v["nb_frames"]) == FRAMES if v.get("nb_frames") else True
        assert abs(float(info["format"]["duration"]) - 10) < .1
        files[key] = {"url": route, "sha256": sha(path), "bytes": path.stat().st_size,
                      "dimensions": [v["width"], v["height"]]}
    # Verify decoded packed RGB and its matte against independent WebM decode,
    # using the green channel sampled by the actual packed-alpha shader.
    pipes = [decoder(PUBLIC/routes["packedVideoUrl"].lstrip("/"), width*2, height),
             decoder(PUBLIC/routes["alphaVideoUrl"].lstrip("/"), width, height, True)]
    alpha_errors, color_errors, opaque_losses, blank_edges = [], [], [], []
    try:
        for i in range(FRAMES):
            packed = read_frame(pipes[0], width*2, height, 3)
            reference = read_frame(pipes[1], width, height, 4)
            assert packed is not None and reference is not None
            a = packed[:, width:, 1].astype(np.float32)/255
            expected = reference[:, :, 3].astype(np.float32)/255
            alpha_errors.append(float(np.abs(a-expected).mean()))
            # Composite checks catch dark halos and double-multiplied light.
            errors = []
            for background in [0., .5, 1.]:
                actual = packed[:, :width].astype(np.float32)/255*a[..., None] + background*(1-a[..., None])
                wanted = reference[:, :, :3].astype(np.float32)/255*expected[..., None] + background*(1-expected[..., None])
                errors.append(float(np.abs(actual-wanted).mean()))
            color_errors.append(max(errors))
            opaque_losses.append(float(np.mean(a[expected > .99] < .97)) if np.any(expected > .99) else 0.)
            blank_edges.append(float(np.max(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]))))
    finally:
        for pipe in pipes:
            pipe.stdout.close(); pipe.terminate(); pipe.wait()
    checks = {"frames": FRAMES, "alphaMAE": float(np.mean(alpha_errors)), "worstAlphaMAE": max(alpha_errors),
              "compositeMAE": float(np.mean(color_errors)), "worstCompositeMAE": max(color_errors),
              "worstOpaqueLossFraction": max(opaque_losses), "maxOuterBorderAlpha": max(blank_edges)}
    assert checks["worstAlphaMAE"] < .02 and checks["worstCompositeMAE"] < .03
    if aid == "HTTN12":
        assert checks["worstOpaqueLossFraction"] < .005
    # Aurora is emitted light: its tiny fully-white tips are not solid interiors.
    # Composite fidelity above measures these instead of an opaque-object gate.
    assert checks["maxOuterBorderAlpha"] < .04
    pad = 20
    profile = {"bounds": {"left": max(0, bounds[0]-pad)/width, "top": max(0, bounds[1]-pad)/height,
                           "right": min(width, bounds[2]+pad)/width, "bottom": min(height, bounds[3]+pad)/height},
               "grounded": False, "mode": "glow" if aid == "HTTN13" else "cutout", "measuredFrames": FRAMES,
               **{key: routes[key] for key in ["packedVideoUrl", "compatiblePackedVideoUrl", "previewVideoUrl"]}}
    report = {"id": aid, "canonicalUrl": asset["url"], "mode": profile["mode"], "frames": FRAMES,
              "sourceSHA256": sha(source), "narrationSourceUrl": f"/videos/ar/original/hq2/{aid}.mp4",
              "narrationSourceSHA256": sha(narration), "files": files, "profile": profile, "checks": checks,
              "browserTested": False, "phoneTested": False}
    print(f"{aid}: encoded and checked {FRAMES} frames; {checks}", flush=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--incoming", type=Path, required=True)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--reuse-encoded", action="store_true", help="Re-decode existing encodes; never skip QA")
    args = parser.parse_args()
    manifest_path = PUBLIC / "videos/ar/manifest.json"
    profiles_path = ROOT / "src/data/arVideoPresentation.json"
    assets = json.loads(manifest_path.read_text(encoding="utf-8"))
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    reports = []
    for aid in ["HTTN13", "HTTN12"]:
        report = build(aid, args.incoming, next(a for a in assets if a["id"] == aid), args.reuse_encoded)
        reports.append(report)
    certificate = {"version": VERSION, "date": "2026-11-13", "kind": "offline-decoded-replacement-QA",
                   "limits": ["No live browser tool was available; no new browser or physical-phone result is claimed.",
                              "Codec agreement is not semantic ground truth for every matted edge.",
                              "Aurora remains intentionally translucent and fades near the end of its source.",
                              "Flood and earthquake candidates are withheld after visual review."], "assets": reports}
    (ROOT / "docs/qa/ar-reviewed-remakes-v4.json").write_text(json.dumps(certificate, indent=2)+"\n")
    if args.publish:
        for report in reports:
            asset = next(a for a in assets if a["id"] == report["id"])
            asset.update({key: file["url"] for key, file in report["files"].items()})
            asset.update({"presentationMode": report["mode"], "qualityVersion": VERSION,
                          "packedQualityVersion": VERSION, "alphaBytes": report["files"]["alphaVideoUrl"]["bytes"],
                          "fallbackBytes": sum(report["files"][k]["bytes"] for k in ["alphaColorUrl", "alphaMaskUrl"])})
            profiles[report["id"]] = report["profile"]
        manifest_path.write_text(json.dumps(assets, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
        profiles_path.write_text(json.dumps(profiles, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
