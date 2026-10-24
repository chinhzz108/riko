"""Compare the delivered packed matte with the source WebM alpha, all frames."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
profiles = json.loads((ROOT / "src/data/arVideoPresentation.json").read_text(encoding="utf-8"))
manifest = json.loads((ROOT / "public/videos/ar/manifest.json").read_text(encoding="utf-8"))
results = []
for asset in manifest:
    if not asset.get("alpha"):
        continue
    profile = profiles[asset["id"]]
    packed = ROOT / "public" / profile["packedVideoUrl"].lstrip("/")
    webm = ROOT / "public" / asset["alphaVideoUrl"].lstrip("/")
    metadata = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
        "-show_entries", "stream=width,height,nb_read_frames", "-of", "json", str(packed),
    ], text=True))["streams"][0]
    assert int(metadata["nb_read_frames"]) == profile["measuredFrames"], asset["id"]
    comparison = subprocess.run([
        "ffmpeg", "-hide_banner", "-threads", "1", "-i", str(packed),
        "-threads", "1", "-c:v", "libvpx-vp9", "-i", str(webm),
        # WebM has a millisecond timebase; compare the same frame index rather
        # than letting framesync pair a rounded PTS with the preceding frame.
        "-filter_complex", "[0:v]crop=iw/2:ih:iw/2:0,format=gray,settb=AVTB,setpts=N/(24*TB)[p];[1:v]alphaextract,format=gray,settb=AVTB,setpts=N/(24*TB)[a];[p][a]ssim",
        "-an", "-f", "null", "-",
    ], text=True, capture_output=True, check=True)
    score = float(re.search(r"All:([\d.]+)", comparison.stderr).group(1))
    assert score >= 0.97, f"{asset['id']} matte fidelity too low: {score}"
    results.append({"id": asset["id"], "frames": profile["measuredFrames"], "matteSSIM": score, **metadata})
    print(f"{asset['id']}: {profile['measuredFrames']} frames, alpha SSIM {score:.5f}", flush=True)
output = ROOT / "tmp/ar-presentation-qa/packed-report.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
print(f"PASS: {len(results)} packed clips; lowest matte SSIM={min(item['matteSSIM'] for item in results):.5f}")
