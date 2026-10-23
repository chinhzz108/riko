#!/usr/bin/env python3
"""Replace each printed QR and add one QR to every QR-less book page."""

from __future__ import annotations

import argparse
import io
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter, Transformation


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "src/data/bookVideoSlots.json"
QR_DIR = ROOT / "public/qr"
SOURCE_DIR = ROOT / "tmp/pdfs/source"
RENDER_DIR = ROOT / "tmp/pdfs/highres"
OUTPUT_DIR = ROOT / "output/pdf/qr-stamped"
POPPLER = Path(
    r"C:\Users\Chinhdz\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe"
)
DPI = 100
ADDED_CARD_PT = 96
ADDED_QR_PT = 84
REPLACED_CARD_PT = 116
REPLACED_QR_PT = 90


def fallback_position(chapter: int, page_number: int) -> tuple[float, float]:
    """Return a page corner for pages that have no printed QR."""
    if page_number == 1:  # Top-right is clear on each branded front cover.
        return 0.90, 0.09
    if chapter == 2 and page_number in {3, 6, 9, 12, 15}:
        return 0.90, 0.09  # Top-right white gutter beside the chapter divider.
    if (chapter, page_number) in {(1, 13), (2, 18), (3, 19)}:
        return 0.90, 0.93  # Bottom-right page corner below the two card columns.
    if (chapter, page_number) == (3, 20):
        return 0.90, 0.93  # Bottom-right white margin beside the single card column.
    if (chapter, page_number) in {(1, 14), (2, 19)}:
        return 0.09, 0.93  # Bottom-left corner over decorative artwork, clear of text.
    if (chapter, page_number) == (3, 21):
        return 0.09, 0.93  # Bottom-left corner over the volcano illustration.
    raise ValueError(f"No QR position defined for chapter {chapter}, page {page_number}")


def expected_old_qr(chapter: int, page_number: int) -> bool:
    if page_number == 2:
        return True
    if chapter == 1:
        return 3 <= page_number <= 12
    if chapter == 2:
        return page_number in {4, 5, 7, 8, 10, 11, 13, 14, 16, 17}
    if chapter == 3:
        return 3 <= page_number <= 18
    return False


def render_for_detection(chapter: int, page_number: int, source: Path) -> Path:
    image_path = RENDER_DIR / f"ch{chapter}-{page_number:02}.jpg"
    if image_path.exists():
        return image_path
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    prefix = RENDER_DIR / f"render-ch{chapter}-{page_number:02}"
    subprocess.run(
        [
            str(POPPLER),
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-r",
            str(DPI),
            "-jpeg",
            "-singlefile",
            str(source),
            str(prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    generated = prefix.with_suffix(".jpg")
    if not generated.exists():
        raise FileNotFoundError(generated)
    generated.replace(image_path)
    return image_path


def detected_center(image_path: Path) -> tuple[float, float] | None:
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError(f"Could not read rendered page {image_path}")
    detector = cv2.QRCodeDetector()
    _, points, _ = detector.detectAndDecode(image)
    if points is None:
        return None
    points = points.reshape(-1, 2)
    return (
        float(points[:, 0].mean()) / image.shape[1],
        float(points[:, 1].mean()) / image.shape[0],
    )


def decode_page_qr(
    image: np.ndarray, center: tuple[float, float], card_pt: int
) -> tuple[str, np.ndarray | None]:
    detector = cv2.QRCodeDetector()
    found_points = None
    height, width = image.shape[:2]
    cx = round(center[0] * width)
    cy = round(center[1] * height)
    half = round(card_pt * DPI / 72 * 1.4)
    roi = image[
        max(0, cy - half) : min(height, cy + half),
        max(0, cx - half) : min(width, cx + half),
    ]
    for scale in (1.0, 1.5, 2.0):
        sample = roi if scale == 1.0 else cv2.resize(
            roi, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC
        )
        decoded, points, _ = detector.detectAndDecode(sample)
        if decoded:
            return decoded, points
        if points is not None:
            found_points = points
    return "", found_points


def make_overlay(qr_path: Path, card_pt: int, qr_pt: int) -> PdfReader:
    qr = Image.open(qr_path).convert("RGB")
    canvas = Image.new("RGB", (1000, 1000), "white")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((3, 3, 997, 997), radius=55, outline=(218, 230, 244), width=8)
    side = round(qr_pt / card_pt * 1000)
    qr = qr.resize((side, side), Image.Resampling.NEAREST)
    offset = (1000 - side) // 2
    canvas.paste(qr, (offset, offset))
    stream = io.BytesIO()
    canvas.save(stream, format="PDF", resolution=72)
    stream.seek(0)
    return PdfReader(stream)


def page_slot_lookup() -> dict[tuple[int, int], dict]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    lookup = {}
    for slot in data["slots"]:
        chapter = int(slot["id"].split("-")[1][1:])
        lookup[(chapter, int(slot["page"]))] = slot
    return lookup


def stamp_pdf(chapter: int, slot_lookup: dict[tuple[int, int], dict]) -> dict:
    source = SOURCE_DIR / f"chapter-{chapter}.pdf"
    output = OUTPUT_DIR / f"Chuong-{chapter}-rikokid-me.pdf"
    output.parent.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(source), strict=False)
    writer = PdfWriter()
    # Do not carry Illustrator's page-private recovery cache into delivery PDFs.
    # It is not part of page rendering and can add hundreds of megabytes.
    writer.append(reader, import_outline=True, excluded_fields=["/PieceInfo"])
    audit = []

    for index, page in enumerate(writer.pages):
        page_number = index + 1
        slot = slot_lookup[(chapter, page_number)]
        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)
        image_path = render_for_detection(chapter, page_number, source)
        center = detected_center(image_path)
        old_expected = expected_old_qr(chapter, page_number)
        if center is None and old_expected:
            # Page 3 of the transport chapter has a heavily decorated QR that
            # OpenCV misses at print preview resolution; its measured center is
            # retained from the source PDF's full-resolution render.
            if (chapter, page_number) == (1, 3):
                center = (0.6521, 0.1079)
            else:
                raise RuntimeError(
                    f"Expected existing QR not detected: chapter {chapter}, page {page_number}"
                )
        if center is None:
            center = fallback_position(chapter, page_number)

        qr_path = QR_DIR / f"riko-{slot['id']}.png"
        expected_url = f"https://rikokid.me/watch/{slot['id']}"
        qr_data, qr_points, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(qr_path)))
        if qr_points is None or qr_data != expected_url:
            raise RuntimeError(f"QR asset mismatch for {slot['id']}: {qr_data!r}")

        card_pt = REPLACED_CARD_PT if old_expected else ADDED_CARD_PT
        qr_pt = REPLACED_QR_PT if old_expected else ADDED_QR_PT
        overlay_reader = make_overlay(qr_path, card_pt, qr_pt)
        overlay = overlay_reader.pages[0]
        center_x = center[0] * page_width
        center_y_from_top = center[1] * page_height
        x = center_x - card_pt / 2
        y = page_height - center_y_from_top - card_pt / 2
        page.merge_transformed_page(
            overlay,
            Transformation().scale(card_pt / 1000).translate(x, y),
            over=True,
        )
        page.compress_content_streams()
        audit.append(
            {
                "slot": slot["id"],
                "page": page_number,
                "url": expected_url,
                "replacedExistingQr": old_expected,
                "centerFraction": [round(center[0], 5), round(center[1], 5)],
                "cardPoints": card_pt,
                "qrPoints": qr_pt,
            }
        )

    writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
    with output.open("wb") as stream:
        writer.write(stream)
    return {"chapter": chapter, "source": str(source), "output": str(output), "pages": audit}


def verify_output(result: dict) -> None:
    chapter = int(result["chapter"])
    pdf_path = Path(result["output"])
    reader = PdfReader(str(pdf_path), strict=False)
    if len(reader.pages) != len(result["pages"]):
        raise RuntimeError(f"Page count changed in {pdf_path}")
    for audit in result["pages"]:
        page_number = audit["page"]
        prefix = RENDER_DIR / f"verify-ch{chapter}-{page_number:02}"
        subprocess.run(
            [
                str(POPPLER),
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-r",
                str(DPI),
                "-jpeg",
                "-singlefile",
                str(pdf_path),
                str(prefix),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        image_path = prefix.with_suffix(".jpg")
        image = cv2.imread(str(image_path))
        center = tuple(audit["centerFraction"])
        decoded, points = decode_page_qr(image, center, audit["cardPoints"])
        if points is None or decoded != audit["url"]:
            raise RuntimeError(
                f"Stamped QR verification failed: {pdf_path.name} page {page_number}: {decoded!r}"
            )
        image_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chapter", type=int, choices=(1, 2, 3), action="append")
    args = parser.parse_args()
    chapters = args.chapter or [1, 2, 3]
    slot_lookup = page_slot_lookup()
    results = []
    for chapter in chapters:
        print(f"Stamping chapter {chapter}...", flush=True)
        result = stamp_pdf(chapter, slot_lookup)
        print(f"Verifying chapter {chapter}...", flush=True)
        verify_output(result)
        results.append(result)
        print(f"Verified {len(result['pages'])} QR codes in chapter {chapter}.", flush=True)
    report = OUTPUT_DIR / "qr-stamp-audit.json"
    report.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Audit: {report}")


if __name__ == "__main__":
    main()
