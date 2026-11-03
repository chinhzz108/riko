#!/usr/bin/env python3
"""Add translation/scale robust popup scenes to the Riko AR YOLO dataset.

The first detector was trained mostly on a centred popup crop.  A physical
pop-up can be lifted, shifted, rotated, or partially outside the camera view,
so this script keeps the original page/crop examples and adds deterministic
copy-paste scenes with the popup at arbitrary positions.  It deliberately
does not alter the original v2 dataset or model.
"""

from __future__ import annotations

import json
import math
import argparse
import shutil
import sys
import zipfile
from pathlib import Path

import resource_budget  # noqa: F401  (must configure the process before cv2)
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
BASE_DIR = ROOT / "output/ar-training/rikokid_ar_dataset"
OUTPUT_DIR = ROOT / "output/ar-training/rikokid_ar_mobile_dataset"
ZIP_PATH = ROOT / "output/ar-training/rikokid_ar_mobile_dataset.zip"
RENDERS_DIR = ROOT / "tmp/pdfs/training/renders"
SLOTS_PATH = ROOT / "src/data/bookVideoSlots.json"
TARGETS_PATH = ROOT / "src/data/arTargets.json"
AUDIT_PATH = ROOT / "output/pdf/qr-stamped/qr-stamp-audit.json"
IMAGE_SIZE = 640
SOURCE_SEED = 20261103

# Import the shared, manually reviewed illustration boxes after resource
# budgeting.  The boxes are used only to extract source pixels; the generated
# labels are transformed along with the pasted patch.
sys.path.insert(0, str(ROOT / "scripts/ar"))
from build_training_dataset import POPUP_BOXES  # noqa: E402


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def slot_chapter(slot_id: str) -> int:
    return int(slot_id.split("-")[1][1:])


def source_path(slot: dict) -> Path:
    return RENDERS_DIR / f"ch{slot_chapter(slot['id'])}-{int(slot['page']):02}.jpg"


def letterbox(image: np.ndarray):
    height, width = image.shape[:2]
    scale = min(IMAGE_SIZE / width, IMAGE_SIZE / height)
    new_width, new_height = round(width * scale), round(height * scale)
    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
    canvas = np.full((IMAGE_SIZE, IMAGE_SIZE, 3), 245, dtype=np.uint8)
    pad_x, pad_y = (IMAGE_SIZE - new_width) // 2, (IMAGE_SIZE - new_height) // 2
    canvas[pad_y : pad_y + new_height, pad_x : pad_x + new_width] = resized
    return canvas, scale, pad_x, pad_y


def page_box(width: int, height: int, scale: float, pad_x: int, pad_y: int):
    return (
        pad_x + 0.018 * width * scale,
        pad_y + 0.012 * height * scale,
        pad_x + 0.982 * width * scale,
        pad_y + 0.988 * height * scale,
    )


def load_clean_page(slot: dict, audit_by_slot: dict[str, dict]) -> np.ndarray:
    image = cv2.imread(str(source_path(slot)), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(source_path(slot))
    scale = min(1.0, 1280 / max(image.shape[:2]))
    if scale < 1:
        image = cv2.resize(image, (round(image.shape[1] * scale), round(image.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    info = audit_by_slot[slot["id"]]
    # These renders use 150 DPI. Scale the physical QR card size with the
    # image; the legacy 100-DPI mask leaves a visible QR rim on these renders.
    height, width = image.shape[:2]
    cx, cy = round(info["centerFraction"][0] * width), round(info["centerFraction"][1] * height)
    half = round(info["cardPoints"] * 150 / 72 * scale / 2) + 5
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[max(0, cy-half):min(height, cy+half), max(0, cx-half):min(width, cx+half)] = 255
    image = cv2.inpaint(image, mask, 5, cv2.INPAINT_TELEA)
    return image


def make_popup_patch(image: np.ndarray, box: tuple[float, float, float, float]):
    height, width = image.shape[:2]
    x1, y1, x2, y2 = box
    # Keep a small amount of paper around the illustration so edges and
    # shadows seen on a raised paper piece are represented, while the label
    # remains the reviewed illustration rectangle.
    pad_x, pad_y = (x2 - x1) * 0.10, (y2 - y1) * 0.10
    left = max(0, round((x1 - pad_x) * width))
    top = max(0, round((y1 - pad_y) * height))
    right = min(width, round((x2 + pad_x) * width))
    bottom = min(height, round((y2 + pad_y) * height))
    patch = image[top:bottom, left:right].copy()
    target = np.array(
        [
            x1 * width - left,
            y1 * height - top,
            x2 * width - left,
            y2 * height - top,
        ],
        dtype=np.float32,
    )
    return patch, target


def transform_patch(
    patch: np.ndarray,
    target: np.ndarray,
    width: int,
    angle: float,
    rng: np.random.Generator,
):
    scale = width / patch.shape[1]
    height = max(16, round(patch.shape[0] * scale))
    resized = cv2.resize(patch, (width, height), interpolation=cv2.INTER_AREA)
    # A perspective warp represents a lifted/tilted paper region. A rotated
    # coverage mask keeps the rectangular white padding out of the scene.
    corners = np.float32([[0,0],[width-1,0],[width-1,height-1],[0,height-1]])
    jitter = np.array([width, height], dtype=np.float32) * 0.08
    projected = corners + rng.uniform(-1, 1, (4,2)).astype(np.float32) * jitter
    perspective = cv2.getPerspectiveTransform(corners, projected)
    edge = max(2, round(min(width, height) * 0.018))
    alpha = np.ones((height, width), dtype=np.float32)
    alpha[:edge] *= np.linspace(0, 1, edge, dtype=np.float32)[:, None]
    alpha[-edge:] *= np.linspace(1, 0, edge, dtype=np.float32)[:, None]
    alpha[:, :edge] *= np.linspace(0, 1, edge, dtype=np.float32)[None, :]
    alpha[:, -edge:] *= np.linspace(1, 0, edge, dtype=np.float32)[None, :]
    resized = cv2.warpPerspective(resized, perspective, (width, height), borderValue=(245,245,245))
    alpha = cv2.warpPerspective(alpha, perspective, (width, height))
    target = target * np.array([scale, scale, scale, scale], dtype=np.float32)
    radians = math.radians(angle)
    c, s = abs(math.cos(radians)), abs(math.sin(radians))
    out_width = max(16, round(width * c + height * s))
    out_height = max(16, round(width * s + height * c))
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    matrix[0, 2] += (out_width - width) / 2
    matrix[1, 2] += (out_height - height) / 2
    rotated = cv2.warpAffine(
        resized,
        matrix,
        (out_width, out_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(245, 245, 245),
    )
    alpha = cv2.warpAffine(alpha, matrix, (out_width, out_height))
    corners = np.float32(
        [[target[0], target[1]], [target[2], target[1]], [target[2], target[3]], [target[0], target[3]]]
    )[None, :, :]
    transformed = cv2.transform(cv2.perspectiveTransform(corners, perspective), matrix)[0]
    box = np.array(
        [transformed[:, 0].min(), transformed[:, 1].min(), transformed[:, 0].max(), transformed[:, 1].max()],
        dtype=np.float32,
    )
    return rotated, box, alpha


def paste_patch(canvas: np.ndarray, patch: np.ndarray, alpha: np.ndarray, x: int, y: int):
    """Paste with a narrow feathered edge; return the visible source offset."""
    height, width = patch.shape[:2]
    left, top = max(0, x), max(0, y)
    right, bottom = min(IMAGE_SIZE, x + width), min(IMAGE_SIZE, y + height)
    if right <= left or bottom <= top:
        return None
    sx, sy = left - x, top - y
    source = patch[sy : sy + bottom - top, sx : sx + right - left]
    visible_alpha = alpha[sy : sy + bottom - top, sx : sx + right - left, None]
    canvas[top:bottom,left:right] = np.clip(
        source.astype(np.float32) * visible_alpha
        + canvas[top:bottom,left:right].astype(np.float32) * (1 - visible_alpha),
        0,
        255,
    ).astype(np.uint8)
    return sx, sy


def clip_box(box: np.ndarray, x: int, y: int):
    left, top, right, bottom = box + np.array([x, y, x, y], dtype=np.float32)
    left, top = max(0.0, left), max(0.0, top)
    right, bottom = min(float(IMAGE_SIZE - 1), right), min(float(IMAGE_SIZE - 1), bottom)
    if right - left < 8 or bottom - top < 8:
        return None
    return left, top, right, bottom


def xyxy_to_yolo(class_id: int, box: tuple[float, float, float, float]) -> str:
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2 / IMAGE_SIZE, (y1 + y2) / 2 / IMAGE_SIZE
    width, height = (x2 - x1) / IMAGE_SIZE, (y2 - y1) / IMAGE_SIZE
    return f"{class_id} {cx:.6f} {cy:.6f} {width:.6f} {height:.6f}\n"


def global_augment(image: np.ndarray, boxes: list[tuple[int, float, float, float, float]], rng: np.random.Generator, angle: float | None, exposure: float, blur: bool):
    chosen_angle = float(rng.uniform(-16, 16) if angle is None else angle)
    radians = math.radians(chosen_angle)
    c, s = math.cos(radians), math.sin(radians)
    center = IMAGE_SIZE / 2
    matrix = np.array(
        [[c, -s, center - c * center + s * center], [s, c, center - s * center - c * center]],
        dtype=np.float32,
    )
    output = cv2.warpAffine(
        image,
        matrix,
        (IMAGE_SIZE, IMAGE_SIZE),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(245, 245, 245),
    )
    mapped: list[tuple[int, float, float, float, float]] = []
    for class_id, x1, y1, x2, y2 in boxes:
        points = cv2.transform(
            np.float32([[[x1, y1], [x2, y1], [x2, y2], [x1, y2]]]), matrix
        )[0]
        tx1, ty1 = points.min(axis=0)
        tx2, ty2 = points.max(axis=0)
        tx1, ty1 = max(0.0, tx1), max(0.0, ty1)
        tx2, ty2 = min(IMAGE_SIZE - 1.0, tx2), min(IMAGE_SIZE - 1.0, ty2)
        if tx2 - tx1 >= 8 and ty2 - ty1 >= 8:
            mapped.append((class_id, tx1, ty1, tx2, ty2))
    lut = np.clip(np.arange(256, dtype=np.float32) * exposure, 0, 255).astype(np.uint8)
    output = cv2.LUT(output, lut)
    if blur:
        output = cv2.GaussianBlur(output, (3, 3), sigmaX=float(rng.uniform(0.25, 0.9)))
    if rng.random() < 0.25:
        noise = rng.normal(0, float(rng.uniform(1, 5)), size=output.shape).astype(np.float32)
        output = np.clip(output.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return output, mapped


def write_sample(split: str, stem: str, image: np.ndarray, boxes: list[tuple[int, float, float, float, float]], records: list[dict]):
    image_path = OUTPUT_DIR / "images" / split / f"{stem}.jpg"
    label_path = OUTPUT_DIR / "labels" / split / f"{stem}.txt"
    image_path.parent.mkdir(parents=True, exist_ok=True)
    label_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(image_path), image, [cv2.IMWRITE_JPEG_QUALITY, 86])
    label_path.write_text("".join(xyxy_to_yolo(cls, box) for cls, *box in boxes), encoding="utf-8")
    records.append({"split": split, "image": image_path.relative_to(OUTPUT_DIR).as_posix(), "labels": label_path.relative_to(OUTPUT_DIR).as_posix()})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Replace only this script's dedicated output directory")
    args = parser.parse_args()
    slots_data = read_json(SLOTS_PATH)
    targets_data = read_json(TARGETS_PATH)
    audit = read_json(AUDIT_PATH)
    audit_by_slot = {page["slot"]: page for book in audit for page in book["pages"]}
    slots = slots_data["slots"]
    classes = [slot["pageClass"] for slot in slots] + [target["popupLabel"] for target in targets_data["targets"]]
    class_index = {name: index for index, name in enumerate(classes)}
    popup_by_page = {page: target["popupLabel"] for target in targets_data["targets"] for page in target["pages"]}
    popup_targets = [target for target in targets_data["targets"] if any(page in POPUP_BOXES for page in target["pages"])]
    backgrounds = [slot for slot in slots if slot["id"] not in popup_by_page]
    if not backgrounds:
        raise RuntimeError("No popup-free page backgrounds are available")

    if OUTPUT_DIR.exists():
        if not args.force:
            raise FileExistsError(f"Output exists: {OUTPUT_DIR}. Use --force to rebuild it.")
        expected = (ROOT / "output/ar-training/rikokid_ar_mobile_dataset").resolve()
        if OUTPUT_DIR.is_symlink() or OUTPUT_DIR.resolve() != expected or expected.parent != (ROOT / "output/ar-training").resolve():
            raise RuntimeError("Refusing to remove an output directory outside the dataset workspace")
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)
    # Retain all previous examples and their labels.  The new scenes are an
    # additive change so old QA numbers remain directly comparable.
    for split in ("train", "val", "test"):
        shutil.copytree(BASE_DIR / "images" / split, OUTPUT_DIR / "images" / split)
        shutil.copytree(BASE_DIR / "labels" / split, OUTPUT_DIR / "labels" / split)

    page_cache: dict[str, tuple[np.ndarray, tuple[float, float, float, float]]] = {}
    popup_cache: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for slot in slots:
        page = load_clean_page(slot, audit_by_slot)
        canvas, scale, pad_x, pad_y = letterbox(page)
        page_cache[slot["id"]] = (canvas, page_box(page.shape[1], page.shape[0], scale, pad_x, pad_y))
    for target in popup_targets:
        slot_id = next(page for page in target["pages"] if page in POPUP_BOXES)
        popup_cache[target["popupLabel"]] = make_popup_patch(load_clean_page(next(slot for slot in slots if slot["id"] == slot_id), audit_by_slot), POPUP_BOXES[slot_id])

    records = [dict(record, image=record["image"].replace("\\", "/"), labels=record["labels"].replace("\\", "/")) for record in read_json(BASE_DIR / "splits.json")]
    for split in ("train", "val", "test-mobile"):
        count = 18 if split == "train" else 4 if split == "val" else 8
        for target_index, target in enumerate(popup_targets):
            label = target["popupLabel"]
            popup_id = class_index[label]
            patch, target_box = popup_cache[label]
            pages = target["pages"]
            for variant in range(count):
                rng = np.random.default_rng(SOURCE_SEED + target_index * 1009 + variant + {"train": 0, "val": 50000, "test-mobile": 90000}[split])
                use_page = (variant + target_index) % 3 != 0
                if use_page:
                    background_slot = backgrounds[int(rng.integers(0, len(backgrounds)))]
                    canvas, background_box = page_cache[background_slot["id"]]
                    image = canvas.copy()
                    boxes: list[tuple[int, float, float, float, float]] = [(class_index[background_slot["pageClass"]], *background_box)]
                else:
                    color = int(rng.choice([30, 68, 120, 190, 235, 250]))
                    image = np.full((IMAGE_SIZE, IMAGE_SIZE, 3), color, dtype=np.uint8)
                    if rng.random() < 0.4:
                        # Low-frequency texture prevents a fixed background
                        # from becoming a shortcut for popup recognition.
                        noise = rng.normal(0, 12, size=image.shape[:2]).astype(np.float32)
                        image = np.clip(image.astype(np.float32) + noise[:, :, None], 0, 255).astype(np.uint8)
                    boxes = []

                if split == "test-mobile":
                    widths = [150, 210, 300, 410, 500, 260, 360, 460]
                    angles = [0, 90, 180, 270, -15, 15, 32, -32]
                    patch_width, angle = widths[variant], angles[variant]
                    exposure = [0.55, 1.0, 1.55, 0.7, 1.25, 1.8, 0.45, 1.0][variant]
                    blur = variant in {4, 6}
                elif split == "val":
                    patch_width = int(rng.integers(175, 420))
                    angle = [0, 90, 180, 270][variant]
                    exposure, blur = [0.65, 1.0, 1.35, 1.7][variant], variant == 3
                else:
                    patch_width = int(rng.integers(150, 500))
                    angle = float(rng.uniform(-180, 180))
                    exposure, blur = float(rng.uniform(0.48, 1.65)), True
                transformed, transformed_box, alpha = transform_patch(patch, target_box, patch_width, float(angle or 0), rng)
                if split == "test-mobile":
                    positions = [(20, 18), (IMAGE_SIZE - transformed.shape[1] - 16, 20), (18, IMAGE_SIZE - transformed.shape[0] - 18), (IMAGE_SIZE - transformed.shape[1] - 20, IMAGE_SIZE - transformed.shape[0] - 18), (IMAGE_SIZE // 2 - transformed.shape[1] // 2, IMAGE_SIZE // 2 - transformed.shape[0] // 2), (35, IMAGE_SIZE // 2 - transformed.shape[0] // 2), (IMAGE_SIZE - transformed.shape[1] - 35, IMAGE_SIZE // 2 - transformed.shape[0] // 2), (IMAGE_SIZE // 2 - transformed.shape[1] // 2, 26)]
                    x, y = positions[variant]
                else:
                    x = int(rng.integers(-round(transformed.shape[1] * 0.18), IMAGE_SIZE - round(transformed.shape[1] * 0.82)))
                    y = int(rng.integers(-round(transformed.shape[0] * 0.18), IMAGE_SIZE - round(transformed.shape[0] * 0.82)))
                offset = paste_patch(image, transformed, alpha, x, y)
                if offset is None:
                    continue
                visible = clip_box(transformed_box, x, y)
                if visible is None:
                    continue
                boxes.append((popup_id, *visible))
                augmented, augmented_boxes = global_augment(image, boxes, rng, angle=None if split == "train" else 0, exposure=exposure, blur=blur)
                stem = f"mobile-popup-{label}-{target_index:02d}-{variant:02d}"
                write_sample(split, stem, augmented, augmented_boxes, records)
                records[-1].update(kind="mobile-popup", preferredLabel=label, sourcePages=pages)

    for split, count in [("train",96),("val",24),("test-negative",48)]:
        for index in range(count):
            rng = np.random.default_rng(SOURCE_SEED + {"train":110000,"val":120000,"test-negative":130000}[split] + index)
            small = rng.integers(20, 245, (5,5,3), dtype=np.uint8)
            image = cv2.resize(small, (IMAGE_SIZE,IMAGE_SIZE), interpolation=cv2.INTER_CUBIC)
            if index % 3 == 0:
                image[:] = int(rng.integers(20,255))
            for mark in range(int(rng.integers(3,20))):
                start = tuple(int(v) for v in rng.integers(0,IMAGE_SIZE-1,2))
                end = tuple(int(v) for v in rng.integers(0,IMAGE_SIZE-1,2))
                color = tuple(int(v) for v in rng.integers(0,255,3))
                cv2.line(image,start,end,color,int(rng.integers(1,12)))
            if index % 2 == 0:
                for row in range(6):
                    cv2.putText(image, f"SAMPLE {index} TEXT {row}", (20,60+row*80), cv2.FONT_HERSHEY_SIMPLEX,.8,(30,30,30),2)
            write_sample(split,f"negative-pattern-{index:03d}",image,[],records)
            records[-1].update(kind="negative")

    # The mobile test is intentionally a separate split; it is evaluated by
    # the Kaggle notebook and browser QA without changing the old test score.

    yaml_lines = ["path: .", "train: images/train", "val: images/val", "test: images/test", f"nc: {len(classes)}", "names:"]
    yaml_lines.extend(f"  {index}: {name}" for index, name in enumerate(classes))
    (OUTPUT_DIR / "data.yaml").write_text("\n".join(yaml_lines) + "\n", encoding="utf-8")
    (OUTPUT_DIR / "class_map.json").write_text(json.dumps({"classes": classes}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT_DIR / "splits.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT_DIR / "README.md").write_text(
        "# Riko AR mobile-popup training set\n\n"
        "This additive v3 dataset retains 1,260 original synthetic page/crop examples. It adds 630 train, 140 validation, and 280 test-mobile scenes, plus 96 train/24 validation/48 held-out generated negatives. Popup region patches are pasted on popup-free printed pages or textured backgrounds at random positions, scales, rotations, perspective, exposures and partial clipping. Their boxes move with the patch. On mixed scenes, preferredLabel identifies the popup to play even when a different printed page is visible.\n\n"
        "Source rectangles are manually estimated regions from flattened PDF art, with some surrounding scenery/mascot; these are not verified object segmentation masks or photographs of raised paper. The train/validation/test images share source artwork. This augments positional robustness but cannot establish real-camera accuracy. Real detached/raised popup photos are still needed for physical validation. Test-mobile and test-negative remain separate from the original test.\n",
        encoding="utf-8",
    )
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=4) as archive:
        for path in OUTPUT_DIR.rglob("*"):
            if path.is_file():
                archive.write(path, Path(OUTPUT_DIR.name) / path.relative_to(OUTPUT_DIR))
    counts = {split: len(list((OUTPUT_DIR / "images" / split).glob("*.jpg"))) for split in ("train", "val", "test", "test-mobile", "test-negative")}
    print(json.dumps({"output": str(OUTPUT_DIR), "zip": str(ZIP_PATH), "zipBytes": ZIP_PATH.stat().st_size, "counts": counts, "classes": len(classes), "popupTargets": len(popup_targets)}, indent=2))


if __name__ == "__main__":
    main()
