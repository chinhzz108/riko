"""Check decoded packed light effects against their native RGB originals."""
import hashlib
import json
from pathlib import Path

import resource_budget
import numpy as np
from repair_video_details import frame_pipe, read_frame

ROOT = Path(__file__).resolve().parents[2]
certificate = json.loads((ROOT / "docs/qa/ar-native-packed-v3.json").read_text(encoding="utf-8"))
results = []
for asset in certificate["assets"]:
    if not asset["id"].startswith("HTTN"):
        continue
    width, height = asset["dimensions"]
    packed = ROOT / "public" / asset["url"].lstrip("/")
    source = ROOT / "public" / asset["sourceUrl"].lstrip("/")
    streams = [frame_pipe(packed, width*2, height), frame_pipe(source, width, height)]
    errors = []
    try:
        for index in range(asset["frames"]):
            frame = read_frame(streams[0], width*2, height, 3)
            reference = read_frame(streams[1], width, height, 3)
            if frame is None or reference is None:
                raise RuntimeError(f"Missing decoded frame: {asset['id']}:{index}")
            color = frame[:, :width].astype(np.float32)
            alpha = frame[:, width:, 1:2].astype(np.float32)/255
            background = 255 if asset["id"] == "HTTN01" else 0
            reconstructed = color*alpha + background*(1-alpha)
            errors.append(float(np.abs(reconstructed-reference).mean()/255))
    finally:
        for stream in streams:
            stream.stdout.close(); stream.terminate(); stream.wait()
    mean, worst = float(np.mean(errors)), float(np.max(errors))
    assert mean < .03 and worst < .05, f"{asset['id']}: decoded source reconstruction {mean}/{worst}"
    results.append({"id":asset["id"], "sha256":hashlib.sha256(packed.read_bytes()).hexdigest(),
        "sourceSHA256":asset["sourceSHA256"], "frames":len(errors),
        "sourceReconstructionMAE":mean, "worstFrameMAE":worst})
    print(f"{asset['id']}: {len(errors)} decoded frames, mean RGB reconstruction error {mean:.6f}, worst {worst:.6f}", flush=True)
report = {"date":"2026-11-03", "kind":"decoded-effects-over-original-studio-background",
    "limits":"Reconstruction fidelity is not semantic ground truth for every matted edge.", "assets":results}
(ROOT / "docs/qa/ar-native-effects-v3.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
