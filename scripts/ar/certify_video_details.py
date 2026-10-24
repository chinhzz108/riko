"""Freeze verified media hashes so CI cannot deploy older damaged mattes."""
import hashlib
import json
from repair_video_details import ROOT, PUBLIC, MEDIA, WORK

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

manifest = json.loads((MEDIA / "manifest.json").read_text())
profiles = json.loads((ROOT / "src/data/arVideoPresentation.json").read_text())
slots = json.loads((ROOT / "src/data/bookVideoSlots.json").read_text())["slots"]
packed = {item["id"]: item for item in json.loads((ROOT / "tmp/ar-presentation-qa/packed-report.json").read_text())}
browser = json.loads((WORK / "browser-packed-results.json").read_text())
assert len(browser) == 45 and all(item["pass"] for item in browser), "Browser render QA incomplete"
assets = []
for asset in manifest:
    aid = asset["id"]
    repair = json.loads((WORK / f"{aid}-repair.json").read_text())
    checks = {key: {"url": asset[key], "sha256": digest(PUBLIC / asset[key].lstrip("/"))}
        for key in ["alphaVideoUrl", "alphaColorUrl", "alphaMaskUrl", "packedVideoUrl", "previewVideoUrl"]}
    assert packed[aid]["webmSHA256"] == checks["alphaVideoUrl"]["sha256"], aid
    assert packed[aid]["packedSHA256"] == checks["packedVideoUrl"]["sha256"], aid
    source_check = None
    if aid != "RIKO" and not aid.startswith("RECAP_"):
        source_check = json.loads((WORK / f"{aid}-source-check.json").read_text())
        assert source_check["pass"] and source_check["checkVersion"] == 2, aid
        assert source_check["assetSHA256"] == checks["alphaVideoUrl"]["sha256"], aid
        original = next((ROOT / "MAM_BOOK_AR/AUDIO_DELIVERY/MP4").glob(f"{aid}-*.mp4"))
        assert digest(original) == checks["previewVideoUrl"]["sha256"], f"{aid} preview must be the untouched RGB source"
    assets.append({"id": aid, "canonicalUrl": asset["url"], "mode": asset["presentationMode"],
        "frames": profiles[aid]["measuredFrames"], "dimensions": [repair["width"], repair["height"]],
        "files": checks, "sourceCheck": source_check, "packedCheck": packed[aid],
        "browserCheck": next(item for item in browser if item["id"] == aid)})

certificate = {"qualityVersion": "detail-preserved-v2", "date": "2026-10-24",
    "limits": ["Source contrast cores are not semantic ground truth for every white edge.",
        "Visual review uses 1, 4 and 8 second snapshots; numerical comparison uses every decoded frame.",
        "Browser shader QA runs in Chromium without a camera; physical iPhone Safari was not tested.",
        "Studio edge halos and source framing can remain; no claim of lossless matting or true 3D."],
    "routes": [{"id": slot["id"], "arVideoUrl": slot["arVideoUrl"]} for slot in slots], "assets": assets}
output = ROOT / "docs/qa/ar-media-detail-v2.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(certificate, indent=2)+"\n")
print(f"Certified {len(assets)} assets, {sum(a['frames'] for a in assets)} encoded frames and {len(slots)} stable page routes")
