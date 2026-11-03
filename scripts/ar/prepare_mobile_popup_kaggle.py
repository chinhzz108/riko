"""Validate and package the movable-popup dataset for Kaggle's input uploader."""
from __future__ import annotations

import hashlib
import json
import py_compile
import zipfile
from pathlib import Path

import resource_budget  # noqa: F401
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "output/ar-training/rikokid_ar_mobile_dataset"
OUTPUT = ROOT / "output/ar-training/mobile-popup-v3"


def sha(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = json.loads((DATA / "splits.json").read_text())
    classes = json.loads((DATA / "class_map.json").read_text())["classes"]
    slots = json.loads((ROOT / "src/data/bookVideoSlots.json").read_text(encoding="utf8"))["slots"]
    targets = json.loads((ROOT / "src/data/arTargets.json").read_text(encoding="utf8"))["targets"]
    assert classes == [s["pageClass"] for s in slots] + [t["popupLabel"] for t in targets]
    assert len(records) == len({r["image"] for r in records}) == 2478
    counts, boxes, negatives = {}, 0, 0
    for record in records:
        path = DATA / record["image"]
        assert path.is_file(), path
        label = DATA / record["labels"]
        lines = label.read_text().splitlines()
        counts[record["split"]] = counts.get(record["split"], 0)+1
        negatives += not lines
        for line in lines:
            values = list(map(float, line.split()))
            assert len(values) == 5 and int(values[0]) == values[0] and 0 <= values[0] < 89, (label,line)
            _,cx,cy,w,h = values
            assert w>0 and h>0 and cx-w/2>=-2e-6 and cy-h/2>=-2e-6 and cx+w/2<=1+2e-6 and cy+h/2<=1+2e-6, (label,line)
            boxes += 1
        if record.get("preferredLabel"):
            assert classes.index(record["preferredLabel"]) in [int(line.split()[0]) for line in lines]
    assert counts == {"train":1446,"val":344,"test":360,"test-mobile":280,"test-negative":48}, counts
    assert negatives == 168
    trainer = ROOT / "scripts/ar/train_mobile_popup_kaggle.py"
    py_compile.compile(str(trainer), doraise=True)
    routing = OUTPUT / "runtime-routing.json"
    routing.write_text(json.dumps({"classes":classes,"slots":slots,"targets":targets},ensure_ascii=False,indent=2), encoding="utf8")
    # Freeze the comparator from its own bundle. The shipped model is v3 now.
    baseline = OUTPUT / "baseline-popup-v2.tflite"
    with zipfile.ZipFile(ROOT / "output/ar-training/riko-ar-model-bundle-int8-v2.zip") as archive:
        baseline.write_bytes(archive.read("riko-ar-detector.tflite"))
    files = {
        "rikokid_ar_mobile_dataset.zip":ROOT / "output/ar-training/rikokid_ar_mobile_dataset.zip",
        "riko-kaggle-offline-input-v2.zip":ROOT / "tmp/riko-kaggle-offline-input-v2.zip",
        "baseline-popup-v2.tflite":baseline,
        "train_mobile_popup_kaggle.py":trainer,
        "runtime-routing.json":routing,
    }
    assert sha(files["baseline-popup-v2.tflite"]) == "7e6b9787be7a50af028795faea3bc03c93ab99730dbace9bfe99abf2e6d2e0d4"
    report = {"version":"mobile-popup-v3","date":"2026-11-03","counts":counts,"classes":89,"boxes":boxes,"negativeImages":negatives,
              "files":{name:{"sha256":sha(path),"bytes":path.stat().st_size} for name,path in files.items()},
              "limits":["Source-art region patches and generated negatives only; no physical raised popup camera ground truth.","One source illustration per popup class; train and held-out examples share source artwork."]}
    report_path = OUTPUT / "input-audit.json"
    report_path.write_text(json.dumps(report,indent=2))
    files[report_path.name] = report_path
    bundle = OUTPUT / "riko-mobile-popup-v3-input.zip"
    # The nested input archives are already compressed; avoid spending CPU
    # recompressing them on the laptop.
    with zipfile.ZipFile(bundle,"w",zipfile.ZIP_STORED) as zf:
        for name,path in files.items():zf.write(path,"riko-mobile-popup-v3-input/"+name)
    bootstrap = "from pathlib import Path\nimport runpy\nscripts = sorted(Path('/kaggle/input').rglob('train_mobile_popup_kaggle.py'))\nassert len(scripts) == 1, 'Attach the Riko mobile popup v3 input dataset.'\nrunpy.run_path(str(scripts[0]), run_name='__main__')\n"
    notebook = {"nbformat":4,"nbformat_minor":5,"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"},"kaggle":{"accelerator":"GPU","isGpuEnabled":True,"isInternetEnabled":False}},
                "cells":[{"cell_type":"code","execution_count":None,"metadata":{},"outputs":[],"source":bootstrap.splitlines(keepends=True)}]}
    (OUTPUT / "riko-mobile-popup-v3.ipynb").write_text(json.dumps(notebook,indent=2))
    (OUTPUT / "bootstrap.py").write_text(bootstrap)
    chosen = [r for r in records if r.get("kind")=="mobile-popup" and r["split"]=="test-mobile" and any(t in r["image"] for t in ["GT01-","GT08-","DV03-","HTTN08-"])][::2]
    sheet = Image.new("RGB",(960,((len(chosen)+3)//4)*270),(34,42,52)); draw=ImageDraw.Draw(sheet)
    for i,r in enumerate(chosen):
        tile=Image.open(DATA / r["image"]).convert("RGB"); overlay=ImageDraw.Draw(tile)
        for line in (DATA / r["labels"]).read_text().splitlines():
            cid,cx,cy,w,h=map(float,line.split()); color="lime" if cid>=54 else "orange"
            overlay.rectangle(((cx-w/2)*640,(cy-h/2)*640,(cx+w/2)*640,(cy+h/2)*640),outline=color,width=3)
        tile=tile.resize((240,240)); x,y=(i%4)*240,(i//4)*270;sheet.paste(tile,(x,y));draw.text((x+4,y+244),r["preferredLabel"],fill="white")
    sheet.save(OUTPUT / "mobile-popup-preview.jpg",quality=92)
    print(json.dumps({"bundle":str(bundle),"bytes":bundle.stat().st_size,"dataset":report},indent=2))


if __name__ == "__main__":main()
