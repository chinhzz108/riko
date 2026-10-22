#!/usr/bin/env python3
"""Create a reproducible YOLO dataset from stamped book pages and popup crops."""

from __future__ import annotations

import csv
import json
import math
import random
import zipfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SLOTS_PATH = ROOT / "src/data/bookVideoSlots.json"
TARGETS_PATH = ROOT / "src/data/arTargets.json"
AUDIT_PATH = ROOT / "output/pdf/qr-stamped/qr-stamp-audit.json"
RENDERS_DIR = ROOT / "tmp/pdfs/training/renders"
OUTPUT_DIR = ROOT / "output/ar-training"
DATASET_DIR = OUTPUT_DIR / "rikokid_ar_dataset"
ZIP_PATH = OUTPUT_DIR / "rikokid_ar_dataset.zip"
IMAGE_SIZE = 640

# Normalized boxes around the page's main pop-up illustration, measured from
# the source-book page art. The QR is masked before training and at inference.
POPUP_BOXES = {
    "book-c1-p03": (0.17, 0.30, 0.69, 0.49),
    "book-c1-p04": (0.13, 0.26, 0.68, 0.49),
    "book-c1-p05": (0.25, 0.27, 0.68, 0.48),
    "book-c1-p06": (0.04, 0.26, 0.37, 0.49),
    "book-c1-p07": (0.02, 0.23, 0.68, 0.49),
    "book-c1-p08": (0.10, 0.25, 0.65, 0.49),
    "book-c1-p09": (0.28, 0.22, 0.69, 0.48),
    "book-c1-p10": (0.06, 0.23, 0.66, 0.48),
    "book-c1-p11": (0.20, 0.25, 0.68, 0.49),
    "book-c1-p12": (0.25, 0.26, 0.67, 0.49),
    "book-c2-p04": (0.36, 0.19, 0.70, 0.44),
    "book-c2-p05": (0.30, 0.22, 0.70, 0.48),
    "book-c2-p07": (0.42, 0.08, 0.70, 0.42),
    "book-c2-p08": (0.33, 0.22, 0.70, 0.48),
    "book-c2-p10": (0.28, 0.18, 0.70, 0.47),
    "book-c2-p11": (0.16, 0.23, 0.70, 0.49),
    "book-c2-p13": (0.34, 0.13, 0.72, 0.45),
    "book-c2-p14": (0.37, 0.26, 0.70, 0.49),
    "book-c2-p16": (0.30, 0.18, 0.72, 0.48),
    "book-c2-p17": (0.24, 0.20, 0.70, 0.48),
    "book-c3-p03": (0.30, 0.15, 0.68, 0.49),
    "book-c3-p04": (0.24, 0.17, 0.71, 0.48),
    "book-c3-p05": (0.31, 0.20, 0.70, 0.48),
    "book-c3-p06": (0.15, 0.08, 0.71, 0.48),
    "book-c3-p07": (0.34, 0.24, 0.70, 0.49),
    "book-c3-p08": (0.34, 0.24, 0.70, 0.49),
    "book-c3-p09": (0.27, 0.20, 0.71, 0.49),
    "book-c3-p10": (0.25, 0.18, 0.71, 0.49),
    "book-c3-p11": (0.30, 0.15, 0.70, 0.49),
    "book-c3-p12": (0.31, 0.18, 0.72, 0.49),
    "book-c3-p13": (0.18, 0.18, 0.70, 0.49),
    "book-c3-p14": (0.39, 0.20, 0.72, 0.50),
    "book-c3-p15": (0.24, 0.18, 0.70, 0.49),
    "book-c3-p16": (0.15, 0.04, 0.70, 0.48),
    "book-c3-p17": (0.28, 0.13, 0.69, 0.48),
    "book-c3-p18": (0.24, 0.15, 0.72, 0.50),
}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def page_source_path(slot: dict) -> Path:
    chapter = int(slot["id"].split("-")[1][1:])
    return RENDERS_DIR / f"ch{chapter}-{int(slot['page']):02}.jpg"


def mask_qr(image: np.ndarray, center: list[float], card_points: float) -> None:
    height, width = image.shape[:2]
    cx = round(center[0] * width)
    cy = round(center[1] * height)
    half = round(card_points * 100 / 72 / 2) + 4
    x1, y1 = max(0, cx - half), max(0, cy - half)
    x2, y2 = min(width, cx + half), min(height, cy + half)
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 255
    cv2.inpaint(image, mask, 15, cv2.INPAINT_TELEA, dst=image)


def letterbox(image: np.ndarray, boxes: list[tuple[int, float, float, float, float]]):
    height, width = image.shape[:2]
    scale = min(IMAGE_SIZE / width, IMAGE_SIZE / height)
    new_width, new_height = round(width * scale), round(height * scale)
    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
    canvas = np.full((IMAGE_SIZE, IMAGE_SIZE, 3), 245, dtype=np.uint8)
    pad_x, pad_y = (IMAGE_SIZE - new_width) // 2, (IMAGE_SIZE - new_height) // 2
    canvas[pad_y : pad_y + new_height, pad_x : pad_x + new_width] = resized
    mapped = []
    for class_id, x1, y1, x2, y2 in boxes:
        mapped.append(
            (
                class_id,
                pad_x + x1 * scale,
                pad_y + y1 * scale,
                pad_x + x2 * scale,
                pad_y + y2 * scale,
            )
        )
    return canvas, mapped


def transform_boxes(
    boxes: list[tuple[int, float, float, float, float]], matrix: np.ndarray
) -> list[tuple[int, float, float, float, float]]:
    transformed = []
    for class_id, x1, y1, x2, y2 in boxes:
        corners = np.array([[[x1, y1], [x2, y1], [x2, y2], [x1, y2]]], dtype=np.float32)
        points = cv2.perspectiveTransform(corners, matrix).reshape(-1, 2)
        tx1, ty1 = points.min(axis=0)
        tx2, ty2 = points.max(axis=0)
        tx1, ty1 = max(0.0, tx1), max(0.0, ty1)
        tx2, ty2 = min(IMAGE_SIZE - 1.0, tx2), min(IMAGE_SIZE - 1.0, ty2)
        if tx2 - tx1 >= 8 and ty2 - ty1 >= 8:
            transformed.append((class_id, tx1, ty1, tx2, ty2))
    return transformed


def augment(
    image: np.ndarray,
    boxes: list[tuple[int, float, float, float, float]],
    rng: np.random.Generator,
    angle: float | None = None,
    exposure: float | None = None,
    perspective: float = 0.035,
    blur: bool = True,
    occlusion: bool = True,
):
    chosen_angle = float(rng.uniform(-180, 180) if angle is None else angle)
    radians = math.radians(chosen_angle)
    c, s = math.cos(radians), math.sin(radians)
    cx = cy = IMAGE_SIZE / 2
    rotation = np.array(
        [
            [c, -s, cx - c * cx + s * cy],
            [s, c, cy - s * cx - c * cy],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float32,
    )
    jitter = perspective * IMAGE_SIZE
    src = np.float32([[0, 0], [IMAGE_SIZE - 1, 0], [IMAGE_SIZE - 1, IMAGE_SIZE - 1], [0, IMAGE_SIZE - 1]])
    dst = src + rng.uniform(-jitter, jitter, size=(4, 2)).astype(np.float32)
    projective = cv2.getPerspectiveTransform(src, dst)
    matrix = projective @ rotation
    output = cv2.warpPerspective(
        image,
        matrix,
        (IMAGE_SIZE, IMAGE_SIZE),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(245, 245, 245),
    )
    mapped_boxes = transform_boxes(boxes, matrix)

    gain = float(rng.uniform(0.45, 1.75) if exposure is None else exposure)
    gamma = float(rng.uniform(0.72, 1.35))
    lut = np.clip((np.arange(256, dtype=np.float32) / 255.0) ** gamma * 255.0 * gain, 0, 255).astype(np.uint8)
    output = cv2.LUT(output, lut)
    channel_gain = rng.uniform(0.92, 1.08, size=(1, 1, 3)).astype(np.float32)
    output = np.clip(output.astype(np.float32) * channel_gain, 0, 255).astype(np.uint8)

    if blur and rng.random() < 0.3:
        output = cv2.GaussianBlur(output, (3, 3), sigmaX=float(rng.uniform(0.2, 1.2)))
    if rng.random() < 0.2:
        noise = rng.normal(0, float(rng.uniform(1, 8)), size=output.shape).astype(np.float32)
        output = np.clip(output.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    if occlusion and rng.random() < 0.18:
        w = int(rng.uniform(24, 100))
        h = int(rng.uniform(24, 110))
        x = int(rng.uniform(0, IMAGE_SIZE - w))
        y = int(rng.uniform(0, IMAGE_SIZE - h))
        color = tuple(int(v) for v in rng.choice([68, 95, 127, 176, 210], size=3))
        cv2.ellipse(output, (x + w // 2, y + h // 2), (w // 2, h // 2), 0, 0, 360, color, -1)
    return output, mapped_boxes


def xyxy_to_yolo(boxes: list[tuple[int, float, float, float, float]]) -> str:
    lines = []
    for class_id, x1, y1, x2, y2 in boxes:
        cx = (x1 + x2) / 2 / IMAGE_SIZE
        cy = (y1 + y2) / 2 / IMAGE_SIZE
        width = (x2 - x1) / IMAGE_SIZE
        height = (y2 - y1) / IMAGE_SIZE
        lines.append(f"{class_id} {cx:.6f} {cy:.6f} {width:.6f} {height:.6f}")
    return "\n".join(lines) + ("\n" if lines else "")


def write_sample(split: str, stem: str, image: np.ndarray, boxes: list[tuple[int, float, float, float, float]], records: list[dict]) -> None:
    image_dir = DATASET_DIR / "images" / split
    label_dir = DATASET_DIR / "labels" / split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    image_path = image_dir / f"{stem}.jpg"
    label_path = label_dir / f"{stem}.txt"
    cv2.imwrite(str(image_path), image, [cv2.IMWRITE_JPEG_QUALITY, 88])
    label_path.write_text(xyxy_to_yolo(boxes), encoding="utf-8")
    records.append({"split": split, "image": str(image_path.relative_to(DATASET_DIR)), "labels": str(label_path.relative_to(DATASET_DIR))})


def make_page_sample(slot: dict, page_class_id: int, popup_class_id: int | None, audit_by_slot: dict[str, dict], rng: np.random.Generator):
    source_path = page_source_path(slot)
    image = cv2.imread(str(source_path))
    if image is None:
        raise FileNotFoundError(source_path)
    info = audit_by_slot[slot["id"]]
    mask_qr(image, info["centerFraction"], info["cardPoints"])
    height, width = image.shape[:2]
    source_boxes = [(page_class_id, 0.018 * width, 0.012 * height, 0.982 * width, 0.988 * height)]
    popup_box = POPUP_BOXES.get(slot["id"])
    if popup_class_id is not None and popup_box is not None:
        source_boxes.append(
            (
                popup_class_id,
                popup_box[0] * width,
                popup_box[1] * height,
                popup_box[2] * width,
                popup_box[3] * height,
            )
        )
    boxed, boxes = letterbox(image, source_boxes)
    return boxed, boxes, image, popup_box


def popup_crop_sample(image: np.ndarray, popup_box: tuple[float, float, float, float]):
    height, width = image.shape[:2]
    x1, y1, x2, y2 = popup_box
    box_width, box_height = x2 - x1, y2 - y1
    pad_x, pad_y = box_width * 0.12, box_height * 0.12
    left = max(0, round((x1 - pad_x) * width))
    top = max(0, round((y1 - pad_y) * height))
    right = min(width, round((x2 + pad_x) * width))
    bottom = min(height, round((y2 + pad_y) * height))
    crop = image[top:bottom, left:right].copy()
    target_box = (
        0,
        (x1 * width - left) / (right - left),
        (y1 * height - top) / (bottom - top),
        (x2 * width - left) / (right - left),
        (y2 * height - top) / (bottom - top),
    )
    boxed, boxes = letterbox(crop, [target_box])
    return boxed, boxes


def main() -> None:
    slots_data = read_json(SLOTS_PATH)
    targets_data = read_json(TARGETS_PATH)
    audit_pages = read_json(AUDIT_PATH)
    audit_by_slot = {page["slot"]: page for book in audit_pages for page in book["pages"]}

    page_classes = [slot["pageClass"] for slot in slots_data["slots"]]
    popup_classes = [target["popupLabel"] for target in targets_data["targets"]]
    class_names = page_classes + popup_classes
    class_index = {name: index for index, name in enumerate(class_names)}
    slot_by_id = {slot["id"]: slot for slot in slots_data["slots"]}
    popup_by_page = {
        page: target["popupLabel"]
        for target in targets_data["targets"]
        for page in target["pages"]
    }

    if DATASET_DIR.exists():
        for path in sorted(DATASET_DIR.rglob("*"), reverse=True):
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    source_seed = 22026

    for page_index, slot in enumerate(slots_data["slots"]):
        page_label = slot["pageClass"]
        popup_label = popup_by_page.get(slot["id"])
        popup_id = class_index[popup_label] if popup_label else None
        page_image, page_boxes, clean_source, popup_box = make_page_sample(
            slot, class_index[page_label], popup_id, audit_by_slot, np.random.default_rng(source_seed + page_index)
        )

        split_counts = {"train": 8, "val": 2, "test": 4}
        for split, count in split_counts.items():
            for variant in range(count):
                rng = np.random.default_rng(source_seed + page_index * 101 + variant + {"train": 0, "val": 1000, "test": 2000}[split])
                if split == "test":
                    angles = [0, 45, 135, 225]
                    exposures = [0.20, 0.45, 1.55, 2.05]
                    angle = angles[variant]
                    exposure = exposures[(variant + page_index) % len(exposures)]
                    perspective = 0.08 if variant in {1, 3} else 0.035
                    blur = False
                    occlusion = False
                elif split == "val":
                    angle = (page_index * 53 + variant * 107) % 360
                    exposure = (0.55, 1.65)[variant]
                    perspective = 0.06
                    blur = variant == 1
                    occlusion = False
                else:
                    angle = None
                    exposure = None
                    perspective = 0.045
                    blur = True
                    occlusion = True
                augmented, augmented_boxes = augment(
                    page_image, page_boxes, rng, angle, exposure, perspective, blur, occlusion
                )
                stem = f"page-{slot['id']}-{variant:02d}"
                write_sample(split, stem, augmented, augmented_boxes, records)

        if popup_id is not None and popup_box is not None:
            popup_view, popup_boxes = popup_crop_sample(clean_source, popup_box)
            popup_label_id = class_index[popup_label]
            popup_boxes = [(popup_label_id, *popup_boxes[0][1:])]
            target_index = next(i for i, target in enumerate(targets_data["targets"]) if target["popupLabel"] == popup_label)
            for split, count in split_counts.items():
                for variant in range(count):
                    rng = np.random.default_rng(source_seed + target_index * 131 + variant + {"train": 3000, "val": 4000, "test": 5000}[split])
                    if split == "test":
                        angles = [15, 105, 195, 285]
                        exposures = [0.22, 0.48, 1.60, 2.15]
                        angle = angles[variant]
                        exposure = exposures[(variant + target_index) % len(exposures)]
                        perspective = 0.09 if variant in {1, 3} else 0.04
                        blur = False
                        occlusion = False
                    elif split == "val":
                        angle = (target_index * 47 + variant * 97) % 360
                        exposure = (0.60, 1.6)[variant]
                        perspective = 0.06
                        blur = variant == 1
                        occlusion = False
                    else:
                        angle = None
                        exposure = None
                        perspective = 0.05
                        blur = True
                        occlusion = True
                    augmented, augmented_boxes = augment(
                        popup_view, popup_boxes, rng, angle, exposure, perspective, blur, occlusion
                    )
                    stem = f"popup-{popup_label}-{slot['id']}-{variant:02d}"
                    write_sample(split, stem, augmented, augmented_boxes, records)

    data_yaml = [
        "path: .",
        "train: images/train",
        "val: images/val",
        "test: images/test",
        f"nc: {len(class_names)}",
        "names:",
    ]
    data_yaml.extend(f"  {index}: {name}" for index, name in enumerate(class_names))
    (DATASET_DIR / "data.yaml").write_text("\n".join(data_yaml) + "\n", encoding="utf-8")
    (DATASET_DIR / "class_map.json").write_text(json.dumps({"classes": class_names}, indent=2) + "\n", encoding="utf-8")
    (DATASET_DIR / "splits.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
    (DATASET_DIR / "README.md").write_text(
        "# Riko AR training set\n\n"
        "Images come from the three QR-stamped PDFs. Each of 54 printed pages has a `page_...` box; 36 illustrated pages also have a `popup_...` box, with both tornado pages mapped to the same HTTN03 video. QR cards are inpainted before training so the model must use the page and illustration. Target crop samples let the detector see the pop-up artwork close up.\n\n"
        "The train, validation, and test examples are synthetic transformations of the same 54 source pages and target crops. The test split exercises rotations, brightness/exposure, and perspective only; it does not measure performance on photographs of a real book or a raised paper pop-up. The popup rectangles were manually estimated from the source page art and should be reviewed against physical pages before relying on them.\n",
        encoding="utf-8",
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=4) as archive:
        for path in DATASET_DIR.rglob("*"):
            if path.is_file():
                archive.write(path, Path("rikokid_ar_dataset") / path.relative_to(DATASET_DIR))

    preview_paths = [
        DATASET_DIR / "images" / "train" / f"page-{slot['id']}-00.jpg"
        for slot in slots_data["slots"]
    ]
    previews = []
    for index, path in enumerate(preview_paths):
        image = Image.open(path).convert("RGB")
        image.thumbnail((144, 144))
        tile = Image.new("RGB", (160, 170), "white")
        tile.paste(image, ((160 - image.width) // 2, 4))
        ImageDraw.Draw(tile).text((7, 150), slots_data["slots"][index]["id"], fill=(30, 42, 63))
        previews.append(tile)
    columns = 6
    rows = math.ceil(len(previews) / columns)
    sheet = Image.new("RGB", (columns * 160, rows * 170), (235, 239, 245))
    for index, tile in enumerate(previews):
        sheet.paste(tile, ((index % columns) * 160, (index // columns) * 170))
    sheet.save(OUTPUT_DIR / "page-training-preview.jpg", quality=90)

    counts = {split: sum(record["split"] == split for record in records) for split in ("train", "val", "test")}
    print(json.dumps({"classCount": len(class_names), "imageCounts": counts, "zip": str(ZIP_PATH), "zipBytes": ZIP_PATH.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
