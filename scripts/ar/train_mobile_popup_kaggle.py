"""Train Riko's movable popup detector on Kaggle GPU, export and audit TFLite.

Run via the generated notebook with the prepared input bundle attached.
Training and conversion intentionally never run on the owner's laptop.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

INPUT = Path("/kaggle/input")
WORK = Path("/kaggle/working/riko-mobile-v3")
WORK.mkdir(parents=True, exist_ok=True)
os.chdir(WORK)
os.environ["OMP_NUM_THREADS"] = "2"


def sha(path):
    path = Path(path)
    if path.is_dir():
        # Kaggle's uploader may expand nested ZIP inputs into directories.
        # Preserve the original prepared dataset fingerprint from the audit.
        audit = json.loads(find_input("input-audit.json").read_text())
        return audit["files"][path.name + ".zip"]["sha256"]
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def unpack(archive, destination):
    destination = Path(destination).resolve()
    with zipfile.ZipFile(archive) as zf:
        for item in zf.infolist():
            assert (destination / item.filename).resolve().is_relative_to(destination), item.filename
        zf.extractall(destination)


def find_input(name):
    matches = sorted(INPUT.rglob(name))
    if not matches and name.endswith(".zip"):
        matches = sorted(INPUT.rglob(name[:-4]))
        matches = [p for p in matches if not any(q != p and q in p.parents for q in matches)]
    assert matches, f"Missing input: {name}. Attach the Riko mobile popup v3 input."
    assert len(matches) == 1, f"Ambiguous input {name}: {matches}"
    return matches[0]


def box_iou(a, b):
    area = max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))
    return area / max(1e-8, (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - area)


def main():
    import torch
    assert torch.cuda.is_available(), "Select GPU T4 x2 or P100 in Kaggle Settings."
    print("GPU:", torch.cuda.get_device_name(0), flush=True)
    offline = WORK / "offline"
    offline_source = find_input("riko-kaggle-offline-input-v2.zip")
    if offline_source.is_dir():
        offline = offline_source
    else:
        unpack(offline_source, offline)
    wheels = sorted((offline / "wheels").glob("*.whl"))
    # The prepared offline converter wheels target the current Kaggle cp313
    # image, matching the previously successful Riko export environment.
    assert sys.version_info[:2] == (3,13), f"Offline wheels require Kaggle Python 3.13; got {sys.version}"
    subprocess.run([sys.executable,"-m","pip","install","--no-index","--no-deps",*map(str,wheels)],check=True)
    from ultralytics import YOLO
    import ultralytics
    import yaml
    import numpy as np
    import cv2
    assert ultralytics.__version__ == "8.4.82", ultralytics.__version__
    cv2.setNumThreads(2)
    torch.set_num_threads(2)
    import ultralytics.utils.checks as checks
    import ultralytics.engine.exporter as exporter
    checks.check_requirements = lambda *a, **k: None
    exporter.check_requirements = lambda *a, **k: None
    calibration = offline / "calibration_image_sample_data_20x128x128x3_float32.npy"
    shutil.copy2(calibration, WORK / calibration.name)
    dataset_archive = find_input("rikokid_ar_mobile_dataset.zip")
    if dataset_archive.is_dir():
        candidates = sorted(dataset_archive.rglob("data.yaml"))
        assert len(candidates) == 1, candidates
        data = candidates[0].parent
    else:
        unpack(dataset_archive, WORK)
        data = WORK / "rikokid_ar_mobile_dataset"
    config = yaml.safe_load((data / "data.yaml").read_text())
    config["path"] = str(data)
    classes = json.loads((data / "class_map.json").read_text())["classes"]
    assert len(classes) == 89 and config["nc"] == 89
    expected_classes = json.loads(find_input("runtime-routing.json").read_text())["classes"]
    assert classes == expected_classes, "Runtime/model class order mismatch"
    routing = json.loads(find_input("runtime-routing.json").read_text())
    records = json.loads((data / "splits.json").read_text())
    assert len({r["image"] for r in records}) == len(records), "Duplicate dataset records"
    counts = {split: sum(r["split"] == split for r in records) for split in {r["split"] for r in records}}
    assert counts == {"train":1446,"val":344,"test":360,"test-mobile":280,"test-negative":48}, counts
    data_yaml = WORK / "data.yaml"
    data_yaml.write_text(yaml.safe_dump(config, sort_keys=False))
    started = time.time()
    report = {"version":"mobile-popup-v3","gpu":torch.cuda.get_device_name(0),"classes":classes,
              "datasetSHA256":sha(dataset_archive),"counts":counts,
              "limits":["Synthetic source-art transformations and region copy-paste, not raised paper camera photographs.",
                        "Validation selects export precision; held-out test is evaluated only after selection.",
                        "Popup patches contain some printed scenery; physical detached popup validation is still required."]}
    print("Dataset:", counts, flush=True)
    model = YOLO(str(offline / "weights/yolo11n.pt"))
    model.train(data=str(data_yaml),imgsz=320,epochs=100,batch=32,device=0,workers=2,
                patience=22,seed=20261103,plots=False,cache=False,project=str(WORK / "runs"),
                name="mobile-popup-v3",exist_ok=True,verbose=False,
                degrees=180,translate=.25,scale=.5,perspective=.0005,
                fliplr=0,flipud=0,hsv_h=.015,hsv_s=.25,hsv_v=.35,
                mosaic=.65,close_mosaic=15,mixup=0,cos_lr=True)
    best = Path(model.trainer.save_dir) / "weights/best.pt"
    assert best.exists()
    trained = YOLO(str(best))
    report["validationPT"] = trained.val(data=str(data_yaml),imgsz=320,batch=32,device=0,workers=2,plots=False,verbose=False).results_dict
    print("Exporting INT8 with float32 input/output (matches browser runtime)", flush=True)
    exported = Path(str(trained.export(format="tflite",imgsz=320,quantize=8,data=str(data_yaml),nms=False)))
    # Select by validation, not by the held-out test. INT8 may damage a small
    # class score range even when PyTorch mAP is high; include a float fallback.
    candidates = sorted(exported.parent.glob("*.tflite"))
    candidates = [p for p in candidates if p.name.endswith(("_int8.tflite","_float32.tflite","_float16.tflite")) and "full_integer" not in p.name]
    assert any("int8" in p.name for p in candidates), [p.name for p in candidates]
    from ai_edge_litert.interpreter import Interpreter
    page_count = 54
    slots = routing["slots"]
    targets = routing["targets"]
    video_by_label = {s["pageClass"]:s["arVideoUrl"] for s in slots}
    video_by_label.update({t["popupLabel"]:t["videoUrl"] for t in targets})

    def evaluate(model_path, splits):
        interpreter = Interpreter(model_path=str(model_path),num_threads=2)
        interpreter.allocate_tensors()
        inp, out = interpreter.get_input_details()[0], interpreter.get_output_details()[0]
        shape = inp["shape"].tolist()
        assert inp["dtype"] == np.float32 and out["dtype"] == np.float32, (inp,out)
        nchw = shape[1] == 3
        size = shape[2] if nchw else shape[1]
        results = []
        for record in records:
            if record["split"] not in splits: continue
            image = cv2.imread(str(data / record["image"].replace("\\","/")))
            image = cv2.cvtColor(cv2.resize(image,(size,size),interpolation=cv2.INTER_LINEAR),cv2.COLOR_BGR2RGB)
            # Same active exposure rule as arDetectorRuntime; this compares
            # actual quantized model output, not just float PyTorch metrics.
            mean = float((image @ np.array([.2126,.7152,.0722])).mean())
            gain = min(4.5,205/max(1,mean)) if mean<85 else max(.65,205/mean) if mean>235 else 1
            values = np.minimum(255,image.astype(np.float32)*gain)/255
            values = values.transpose(2,0,1) if nchw else values
            interpreter.set_tensor(inp["index"],values[None].astype(np.float32)); at=time.perf_counter(); interpreter.invoke()
            raw = interpreter.get_tensor(out["index"])[0]
            if raw.shape[0] != 93: raw=raw.T
            scores=raw[4:]; ids=scores.argmax(0); confidence=scores.max(0)
            order=np.argsort(confidence)[::-1]
            detections=[]
            for index in order:
                cls=int(ids[index]); score=float(confidence[index]); threshold=.05 if cls>=page_count else .35
                if score<threshold:continue
                cx,cy,w,h=raw[:4,index]
                if max(abs(cx),abs(cy),abs(w),abs(h))<=2:cx,cy,w,h=np.array([cx,cy,w,h])*size
                box=[max(0,float(cx-w/2)),max(0,float(cy-h/2)),min(size,float(cx+w/2)),min(size,float(cy+h/2))]
                if box[2]<=box[0] or box[3]<=box[1]:continue
                if any(d["classId"]==cls and box_iou(d["box"],box)>.45 for d in detections):continue
                detections.append({"classId":cls,"score":score,"box":box})
                if len(detections)==12:break
            elapsed=(time.perf_counter()-at)*1000
            lines=(data / record["labels"].replace("\\","/")).read_text().splitlines()
            expected=[]
            for line in lines:
                cls,cx,cy,w,h=map(float,line.split());expected.append((int(cls),[(cx-w/2)*size,(cy-h/2)*size,(cx+w/2)*size,(cy+h/2)*size]))
            # Mobile scenes require the popup video even on a different page.
            preferred=record.get("preferredLabel")
            expected_videos={video_by_label[preferred]} if preferred else {video_by_label[classes[c]] for c,_ in expected}
            page=next((d for d in detections if d["classId"]<54),None)
            page_video=video_by_label[classes[page["classId"]]] if page else None
            popup=next((d for d in detections if d["classId"]>=54 and d["score"]>=.5),None)
            # A confident independent popup takes priority. Lower-score popup
            # candidates still cannot override a stronger conflicting page.
            chosen=popup or next((d for d in detections if not (d["classId"]>=54 and page and video_by_label[classes[d["classId"]]]!=page_video and d["score"]<page["score"])),None)
            chosen_video=video_by_label[classes[chosen["classId"]]] if chosen else None
            hits=[any(d["classId"]==cls and box_iou(d["box"],box)>=.5 for d in detections) for cls,box in expected if cls>=54]
            results.append({"image":record["image"],"split":record["split"],"preferredLabel":preferred,
                            "routeCorrect":chosen_video in expected_videos if expected else chosen is None,
                            "selected":classes[chosen["classId"]] if chosen else None,
                            "wrongOpen":bool(chosen and chosen_video not in expected_videos),
                            "popupHits":sum(hits),"popupTotal":len(hits),"ms":elapsed})
        stats={}
        for split in splits:
            rows=[r for r in results if r["split"]==split]
            stats[split]={"correct":sum(r["routeCorrect"] for r in rows),"wrongOpen":sum(r["wrongOpen"] for r in rows),"total":len(rows),
                          "popupHitsIoU50":sum(r["popupHits"] for r in rows),"popupTotal":sum(r["popupTotal"] for r in rows),
                          "medianMs":float(np.median([r["ms"] for r in rows]))}
        return {"file":Path(model_path).name,"sha256":sha(model_path),"bytes":Path(model_path).stat().st_size,"inputShape":shape,"stats":stats,"results":results}

    validations=[]
    for candidate in candidates:
        audit=evaluate(candidate,{"val"});validations.append((candidate,audit))
        print("Validation export:",candidate.name,audit["stats"],flush=True)
    # Reward correct routes and penalize false selections; when accuracy is
    # equal prefer the smaller INT8 model for mobile decoding/inference.
    selected,validation=max(validations,key=lambda pair:(pair[1]["stats"]["val"]["correct"]-2*pair[1]["stats"]["val"]["wrongOpen"],-pair[1]["bytes"]))
    report["exportValidation"]=[a for _,a in validations]
    report["selected"]={k:v for k,v in validation.items() if k!="results"}
    report["heldOut"]=evaluate(selected,{"test","test-mobile","test-negative"})
    baseline=find_input("baseline-popup-v2.tflite")
    report["baseline"]=evaluate(baseline,{"test","test-mobile","test-negative"})
    report["elapsedSeconds"]=round(time.time()-started,1)
    bundle_dir=WORK / "riko-ar-mobile-v3-bundle";bundle_dir.mkdir(exist_ok=True)
    shutil.copy2(selected,bundle_dir / "riko-ar-detector.tflite")
    shutil.copy2(best,bundle_dir / "best.pt")
    (bundle_dir / "class_map.json").write_text(json.dumps({"classes":classes},indent=2))
    (bundle_dir / "metrics.json").write_text(json.dumps(report,indent=2,default=float))
    archive=Path("/kaggle/working/riko-ar-mobile-v3-bundle.zip")
    with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED,compresslevel=4) as zf:
        for path in bundle_dir.iterdir():zf.write(path,path.name)
    print(json.dumps({"bundle":str(archive),"selected":report["selected"],"heldOut":report["heldOut"]["stats"],"baseline":report["baseline"]["stats"],"elapsedSeconds":report["elapsedSeconds"]},indent=2),flush=True)
    from IPython.display import FileLink,display
    display(FileLink(str(archive)))


if __name__ == "__main__":
    main()
