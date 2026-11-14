"""Build reviewed replacement clips, preserving printed QR routes.

This is offline decode/matte QA, not a claim of physical-phone/browser testing.
Flood/earthquake retain their source framing, accepted by the user's request.
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
SOURCES = {
    "HTTN01": ("HTTN01_rainbow.mp4", "431299123245dbe8829caca2418f8fe5c6d174a95102e5fed0678310e9a8c560"),
    "HTTN02": ("HTTN02_hail.mp4", "1e947b621c081b504bf4c89ff27e300c87363d7ca880ed0d0df1f04d52a1feb6"),
    "HTTN03": ("HTTN03_tornado.mp4", "e5f08caf4df8768a598756cf361a4b0b6fe565d0c805910d681e4ec1b15ddcfc"),
    "HTTN04": ("HTTN04_flash_flood_take2.mp4", "8a795ac344cf8abd70e0b666c76a21e05a45676fbe288c9710a1b93ed60c42df"),
    "HTTN05": ("HTTN05_volcano.mp4", "9bcf0e0950e255e818d9448c797f2c683577b7af940f3c55ec7c8bfb555f27b6"),
    "HTTN06": ("HTTN06_lightning.mp4", "dec60008ed7907c7f7f2ee88684e5729f5de1a393bce303feb2f26505f1dd65a"),
    "HTTN07": ("HTTN07_snow.mp4", "a8419fc4e1bd9d62ec05302f027b7a20b7099fa42d42b8bccb007f40888ef945"),
    "HTTN08": ("HTTN08_tropical_cyclone.mp4", "29d5424620c4d652f848ceaac4f184bb0c93ac76c23888d580b7e06e1613fd20"),
    "HTTN09": ("HTTN09_earthquake_take1_REPAIRED.mp4", "1c2f8a83b227722415dfa2fb18a96aee3aedcffd5c21a6085c68424ca500cf84"),
    "HTTN10": ("HTTN10_tsunami.mp4", "5cafc68b0f916eff143bfac6944fa02bec79ab12370fe6fedba9f645c5a7c781"),
    "HTTN11": ("HTTN11_geyser.mp4", "f02e057453234dc24c44e8a53f6d133bd9c4cc505ed3dd40e97aef02a85ed632"),
    "HTTN12": ("HTTN12_tides_take1_REPAIRED.mp4", "2bc70bc998f4fdf6efd0ac9d819291e72c5aae35c03cf9dd69efbb4048a8b3d4"),
    "HTTN13": ("HTTN13_aurora_take1.mp4", "c11e3d1f9edfc57ee12249ed6caf0e0ee0dc392875561be4d530502a2f76821b"),
    "HTTN14": ("HTTN14_solar_eclipse.mp4", "0ed1ec486d0f89ea57904cab83a957f5d6e049b919605dcfb062fdc5885a19ef"),
}
CHAPTER3_REPAIRS = {"HTTN01", "HTTN02", "HTTN03", "HTTN05", "HTTN06", "HTTN07", "HTTN08", "HTTN11", "HTTN14"}
GLOWS = {"HTTN06", "HTTN07", "HTTN13"}
DENSE_TEXTURES = {"HTTN02", "HTTN04", "HTTN07", "HTTN08", "HTTN11"}
FLAT_PREVIEWS = set(SOURCES) - {"HTTN13"}
cv2.setNumThreads(1)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ], text=True))


def matte(rgb, aid):
    if aid in CHAPTER3_REPAIRS:
        from chapter3_matte import matte as chapter3_matte
        return chapter3_matte(rgb, aid)
    f = rgb.astype(np.float32) / 255
    if aid == "HTTN10":
        # The backdrop is fixed neutral RGB32. Estimating it from each frame's
        # top edge mistakes the rising wave/spray for background later in time.
        background = np.full(3, 32 / 255, np.float32)
        distance = np.max(np.abs(f - background), axis=2)
        alpha = np.clip((distance - .015) / .25, 0, 1)
        # Preserve the dark water below connected cyan water / bright foam.
        # A gray-distance key alone makes dark troughs transparent.
        core = np.uint8((f[:, :, 2] - f[:, :, 0] > .13)
                        | (f[:, :, 1] - f[:, :, 0] > .13) | (f.max(2) > .65))
        core = cv2.morphologyEx(core, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
        _, labels = cv2.connectedComponents(core)
        ids = np.unique(labels[-1])
        solid = np.maximum.accumulate(np.isin(labels, ids[ids != 0]), axis=0)
        solid = cv2.dilate(np.uint8(solid), np.ones((3, 3), np.uint8))
        body = cv2.GaussianBlur(solid.astype(np.float32), (41, 41), 8)
        alpha = np.maximum(cv2.GaussianBlur(np.maximum(alpha, body), (3, 3), .6), body)
        color = np.divide(f - (1 - alpha[..., None]) * background, alpha[..., None],
                          out=np.zeros_like(f), where=alpha[..., None] > .001)
    elif aid == "HTTN13":
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
        if aid in {"HTTN04", "HTTN09"}:
            excess = f[:, :, 1] - np.maximum(f[:, :, 0], f[:, :, 2])
            alpha = 1 - np.clip((excess - .10) / .65, 0, 1)
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


def build_flat_preview(packed, narration, target, width, height, crf=14):
    """A normal video player cannot apply the AR matte; composite it on black."""
    pipe = decoder(packed, width * 2, height)
    encoder = subprocess.Popen([
        "ffmpeg", "-v", "error", "-y", "-threads", "1", "-f", "rawvideo",
        "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", str(FPS), "-i", "pipe:0",
        "-i", str(narration), "-map", "0:v:0", "-map", "1:a:0", "-frames:v", str(FRAMES),
        "-c:v", "libx264", "-threads", "1", "-preset", "fast", "-crf", str(crf),
        "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(target),
    ], stdin=subprocess.PIPE)
    try:
        for i in range(FRAMES):
            frame = read_frame(pipe, width * 2, height, 3)
            assert frame is not None
            black = frame[:, :width].astype(np.float32) * (frame[:, width:, 1:2].astype(np.float32) / 255)
            encoder.stdin.write(np.uint8(black).tobytes())
        encoder.stdin.close()
        assert encoder.wait() == 0
        assert pipe.stdout.read(1) == b"" and pipe.wait() == 0
    finally:
        pipe.stdout.close()
        for process in [pipe, encoder]:
            if process.poll() is None:
                process.terminate(); process.wait()


def build(aid, incoming, asset, reuse_encoded=False):
    source = incoming / SOURCES[aid][0]
    assert sha(source) == SOURCES[aid][1], "New input requires a fresh review and immutable version"
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
        "previewVideoUrl": f"/videos/ar/original/{VERSION}/{aid}{'-keyed' if aid in FLAT_PREVIEWS else ''}.mp4",
    }
    for route in routes.values():
        (PUBLIC / route.lstrip("/")).parent.mkdir(parents=True, exist_ok=True)
    run = ["ffmpeg", "-v", "error", "-y", "-threads", "1", "-filter_complex_threads", "1"]
    reference_url = f"/videos/ar/original/{VERSION}/{aid}.mp4"
    subprocess.run(run + ["-i", str(source), "-i", str(narration), "-map", "0:v:0", "-map", "1:a:0",
                         "-c", "copy", "-t", "10", "-movflags", "+faststart",
                         str(PUBLIC / reference_url.lstrip("/"))], check=True)
    graph = "[0:v]split=4[w][c][m][p];[m]alphaextract,format=yuv420p[mask];[c]format=yuv420p[color];[p]split[pc][pa];[pc]format=yuv420p[rgb];[pa]alphaextract,format=yuv420p[a];[rgb][a]hstack=inputs=2[packed];[packed]split[native][small];[small]scale=1920:-2:flags=lanczos[compatible]"
    command = run + ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}", "-r", str(FPS),
                     "-i", "pipe:0", "-i", str(narration), "-filter_complex", graph]
    command += ["-map", "[w]", "-map", "1:a:0", "-frames:v", str(FRAMES), "-c:v", "libvpx-vp9",
                "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1",
                "-deadline", "good", "-cpu-used", "5", "-row-mt", "1", "-threads", "2", "-crf", "30" if aid == "HTTN07" else "28" if aid == "HTTN11" else "26" if aid in DENSE_TEXTURES else "20", "-b:v", "0",
                "-c:a", "libopus", "-b:a", "96k", str(PUBLIC / routes["alphaVideoUrl"].lstrip("/"))]
    for key, label, crf in [("alphaColorUrl", "color", "14"), ("alphaMaskUrl", "mask", "10"),
                             ("packedVideoUrl", "native", "14"), ("compatiblePackedVideoUrl", "compatible", "16")]:
        # Dense flood-water texture needs a different rate to fit Pages' 25 MiB
        # per-file limit. Preserve native pixels and measure the delivered encode.
        if aid in DENSE_TEXTURES and key in {"alphaColorUrl", "packedVideoUrl"}:
            crf = "18"
        command += ["-map", f"[{label}]"]
        command += ["-an"] if key == "alphaMaskUrl" else ["-map", "1:a:0", "-c:a", "copy"]
        command += ["-frames:v", str(FRAMES), "-c:v", "libx264", "-threads", "1", "-preset", "fast", "-crf", crf,
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(PUBLIC / routes[key].lstrip("/"))]
    reuse_encoded = reuse_encoded and all((PUBLIC / route.lstrip("/")).is_file()
                                         and 0 < (PUBLIC / route.lstrip("/")).stat().st_size < 25*1024*1024
                                         for key, route in routes.items() if key != "previewVideoUrl")
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
    if aid in FLAT_PREVIEWS:
        build_flat_preview(PUBLIC / routes["packedVideoUrl"].lstrip("/"), narration,
                           PUBLIC / routes["previewVideoUrl"].lstrip("/"), width, height, 18 if aid in DENSE_TEXTURES else 14)
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
    if aid == "HTTN10":
        pipes.append(decoder(source, width, height))
    alpha_errors, color_errors, opaque_losses, blank_edges = [], [], [], []
    background_alphas, water_losses, background_fractions = [], [], []
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
            if aid == "HTTN10":
                original = read_frame(pipes[2], width, height, 3)
                assert original is not None
                # Independent source-color samples, eroded away from mixed spray.
                neutral = np.uint8(np.max(np.abs(original.astype(np.float32) - 32), axis=2) <= 2)
                neutral = cv2.erode(neutral, np.ones((41, 41), np.uint8)) > 0
                # Some late frames are entirely covered by water/spray.
                if neutral.sum() > 500:
                    background_alphas.append(float(a[neutral].max()))
                    background_fractions.append(float(neutral.mean()))
                water_losses.append(float(np.mean(a[int(height*.85):] < .97)))
            if i % 60 == 59:
                print(f"{aid}: packed/alpha checked {i+1}/{FRAMES}", flush=True)
    finally:
        for pipe in pipes:
            pipe.stdout.close(); pipe.terminate(); pipe.wait()
    checks = {"frames": FRAMES, "alphaMAE": float(np.mean(alpha_errors)), "worstAlphaMAE": max(alpha_errors),
              "compositeMAE": float(np.mean(color_errors)), "worstCompositeMAE": max(color_errors),
              "worstOpaqueLossFraction": max(opaque_losses), "maxOuterBorderAlpha": max(blank_edges)}
    print(f"{aid}: decoded checks {checks}", flush=True)
    assert checks["worstAlphaMAE"] < .02 and checks["worstCompositeMAE"] < .03
    if aid not in GLOWS:
        assert checks["worstOpaqueLossFraction"] < .005
    # Aurora is emitted light: its tiny fully-white tips are not solid interiors.
    # Composite fidelity above measures these instead of an opaque-object gate.
    if aid == "HTTN10":
        # Water intentionally reaches the bottom/sides; demanding transparent
        # borders here would erase real water. Other assets keep their gate.
        checks.update({"maxKnownBackgroundAlpha": max(background_alphas),
                       "minKnownBackgroundFraction": min(background_fractions),
                       "knownBackgroundFrames": len(background_alphas),
                       "worstBottomWaterLossFraction": max(water_losses)})
        assert checks["knownBackgroundFrames"] >= 120
        assert checks["maxKnownBackgroundAlpha"] < .04
        assert checks["worstBottomWaterLossFraction"] < .005
    else:
        assert checks["maxOuterBorderAlpha"] < .04
    pad = 20
    profile = {"bounds": {"left": max(0, bounds[0]-pad)/width, "top": max(0, bounds[1]-pad)/height,
                           "right": min(width, bounds[2]+pad)/width, "bottom": min(height, bounds[3]+pad)/height},
               "grounded": False, "mode": "glow" if aid in GLOWS else "cutout", "measuredFrames": FRAMES,
               **{key: routes[key] for key in ["alphaVideoUrl", "packedVideoUrl", "compatiblePackedVideoUrl", "previewVideoUrl"]}}
    report = {"id": aid, "canonicalUrl": asset["url"], "mode": profile["mode"], "frames": FRAMES,
              "sourceSHA256": sha(source), "narrationSourceUrl": f"/videos/ar/original/hq2/{aid}.mp4",
              "sourceReferenceUrl": reference_url, "sourceReferenceSHA256": sha(PUBLIC / reference_url.lstrip("/")),
              "narrationSourceSHA256": sha(narration), "files": files, "profile": profile, "checks": checks,
              "browserTested": False, "phoneTested": False}
    print(f"{aid}: encoded and checked {FRAMES} frames; {checks}", flush=True)
    checkpoint = ROOT / f"output/qa/reviewed-remakes-v4/{aid}-build.json"
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    checkpoint.write_text(json.dumps(report, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--incoming", type=Path, required=True)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--reuse-encoded", action="store_true", help="Re-decode existing encodes; never skip QA")
    parser.add_argument("--id", choices=list(SOURCES), nargs="+", help="Build selected clips and retain other reviewed reports")
    args = parser.parse_args()
    manifest_path = PUBLIC / "videos/ar/manifest.json"
    profiles_path = ROOT / "src/data/arVideoPresentation.json"
    assets = json.loads(manifest_path.read_text(encoding="utf-8"))
    profiles = json.loads(profiles_path.read_text(encoding="utf-8"))
    certificate_path = ROOT / "docs/qa/ar-reviewed-remakes-v4.json"
    selected = args.id or list(SOURCES)
    reports = []
    if args.id and certificate_path.is_file():
        reports = [report for report in json.loads(certificate_path.read_text())["assets"] if report["id"] not in selected]
    for aid in selected:
        report = build(aid, args.incoming, next(a for a in assets if a["id"] == aid), args.reuse_encoded)
        reports.append(report)
    certificate = {"version": VERSION, "date": "2026-11-14", "kind": "offline-decoded-replacement-QA",
                   "limits": ["No live browser tool was available; no new browser or physical-phone result is claimed.",
                              "Codec agreement is not semantic ground truth for every matted edge.",
                              "Aurora remains intentionally translucent and fades near the end of its source.",
                              "Tsunami gray backdrop is removed; fine spray remains approximate and water retains cropped bottom/side source framing.",
                              "Flood retains rectangular source framing; earthquake retains an oval scene and weak shaking, accepted by the user."], "assets": reports}
    certificate_path.write_text(json.dumps(certificate, indent=2)+"\n")
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
