#!/usr/bin/env python3
"""Prepare page images and overlay geometry for the MindAR image target file."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/ar"))
from build_training_dataset import POPUP_BOXES, mask_qr  # noqa: E402

SLOTS = json.loads((ROOT / "src/data/bookVideoSlots.json").read_text(encoding="utf-8"))["slots"]
AUDIT = json.loads((ROOT / "output/pdf/qr-stamped/qr-stamp-audit.json").read_text(encoding="utf-8"))
AUDIT_BY_SLOT = {page["slot"]: page for book in AUDIT for page in book["pages"]}
RENDER_DIR = ROOT / "tmp/pdfs/training/renders"
TARGET_DIR = ROOT / "tmp/ar-targets/pages"
SOURCE_MANIFEST = ROOT / "src/data/arPageTargets.json"
TARGET_DIR.mkdir(parents=True, exist_ok=True)


def slot_chapter(slot_id: str) -> int:
    return int(slot_id.split("-")[1][1:])


def page_crop(image: np.ndarray) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    # Drop the PDF canvas margins while retaining the actual printed page edge.
    ink = image.min(axis=2) < 250
    ys, xs = ink.nonzero()
    if len(xs) == 0 or len(ys) == 0:
        return image, (0, 0, image.shape[1], image.shape[0])
    height, width = image.shape[:2]
    margin_x, margin_y = round(width * 0.018), round(height * 0.018)
    left = max(0, int(xs.min()) - margin_x)
    top = max(0, int(ys.min()) - margin_y)
    right = min(width, int(xs.max()) + 1 + margin_x)
    bottom = min(height, int(ys.max()) + 1 + margin_y)
    return image[top:bottom, left:right], (left, top, right, bottom)


def slot_overlay_box(slot_id: str, crop: tuple[int, int, int, int], size: tuple[int, int]):
    box = POPUP_BOXES.get(slot_id)
    if box is None:
        video = next((item for item in SLOTS if item["id"] == slot_id), {})
        if video.get("arVideoUrl", "").endswith("/RIKO.webm"):
            # Place the portrait Riko clip in the open center of the cover pages.
            return {"left": 0.34, "top": 0.23, "right": 0.66, "bottom": 0.77, "kind": "cover"}
        # Chapter intros and recaps use a landscape video plane in the center.
        return {"left": 0.16, "top": 0.28, "right": 0.84, "bottom": 0.70, "kind": "recap"}
    x0, y0, x1, y1 = crop
    width, height = size
    crop_left, crop_top = x0 / width, y0 / height
    crop_width, crop_height = (x1 - x0) / width, (y1 - y0) / height
    left, top, right, bottom = box
    return {
        "left": round(max(0.0, min(1.0, (left - crop_left) / crop_width)), 5),
        "top": round(max(0.0, min(1.0, (top - crop_top) / crop_height)), 5),
        "right": round(max(0.0, min(1.0, (right - crop_left) / crop_width)), 5),
        "bottom": round(max(0.0, min(1.0, (bottom - crop_top) / crop_height)), 5),
        "kind": "popup",
    }


targets = []
for index, slot in enumerate(SLOTS):
    slot_id = slot["id"]
    page_path = RENDER_DIR / f"ch{slot_chapter(slot_id)}-{int(slot['page']):02}.jpg"
    image = cv2.imread(str(page_path))
    if image is None:
        raise FileNotFoundError(page_path)
    mask_qr(image, AUDIT_BY_SLOT[slot_id]["centerFraction"], AUDIT_BY_SLOT[slot_id]["cardPoints"])
    cropped, crop = page_crop(image)
    height, width = cropped.shape[:2]
    scale = min(1.0, 1024 / max(width, height))
    if scale < 1:
        cropped = cv2.resize(cropped, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    target_path = TARGET_DIR / f"{slot_id}.jpg"
    Image.fromarray(cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB)).save(target_path, quality=90, optimize=True)
    targets.append(
        {
            "index": index,
            "slotId": slot_id,
            "label": slot["label"],
            "targetImage": f"/tmp/ar-targets/pages/{target_path.name}",
            "targetSize": {"width": cropped.shape[1], "height": cropped.shape[0]},
            "overlayBox": slot_overlay_box(slot_id, crop, (image.shape[1], image.shape[0])),
        }
    )

manifest = json.dumps({"engine": "MindAR image tracking", "targets": targets}, ensure_ascii=False, indent=2) + "\n"
SOURCE_MANIFEST.write_text(manifest, encoding="utf-8")
print(json.dumps({"targets": len(targets), "manifest": str(SOURCE_MANIFEST), "images": str(TARGET_DIR)}, ensure_ascii=False))
