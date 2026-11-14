"""Per-effect background isolation for the fixed chapter-three source clips.

Model confidence is used only to locate vegetation/terrain, never as opacity.
"""
from functools import lru_cache
import hashlib
from pathlib import Path

import resource_budget
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=4)
def first_frame(aid):
    originals = list((ROOT / "MAM_BOOK_AR/ORIGINAL_DOWNLOADS").glob(f"{aid}_*.mp4"))
    path = originals[0] if originals else ROOT / f"public/videos/ar/original/remake-v4/{aid}.mp4"
    cap = cv2.VideoCapture(str(path))
    ok, bgr = cap.read()
    cap.release()
    assert ok
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255


@lru_cache(maxsize=1)
def session():
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    model = ROOT / "tmp/models/u2net-full.onnx"
    assert hashlib.sha256(model.read_bytes()).hexdigest() == "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491", "Re-review matte before changing the locator model"
    return ort.InferenceSession(str(model), options,
                               providers=["CPUExecutionProvider"])


def locate(rgb):
    small = cv2.resize(rgb, (320, 320)).astype(np.float32) / 255
    small = (small - np.array([.485, .456, .406], np.float32)) / np.array([.229, .224, .225], np.float32)
    model = session()
    result = model.run(None, {model.get_inputs()[0].name: small.transpose(2, 0, 1)[None]})[0][0, 0]
    result = (result - result.min()) / max(float(result.max() - result.min()), 1e-6)
    return cv2.resize(result, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)


def filled(mask):
    binary = np.uint8(mask) * 255
    inverse = cv2.copyMakeBorder(255 - binary, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=255)
    cv2.floodFill(inverse, None, (0, 0), 0)
    return np.maximum(binary, inverse[1:-1, 1:-1]).astype(np.float32) / 255


def edge_fade(shape, pixels=20, empty=4):
    h, w = shape
    y, x = np.mgrid[:h, :w]
    # Leave a few truly empty pixels so YUV scaling/compression cannot bleed
    # the matte back onto the exact edge of the rendered video rectangle.
    return np.clip((np.minimum.reduce([x, w - 1 - x, y, h - 1 - y]) - empty) / pixels, 0, 1)


def unassociate(f, alpha, background=0):
    return np.divide(f - (1 - alpha[..., None]) * background, alpha[..., None],
                     out=np.zeros_like(f), where=alpha[..., None] > .001)


@lru_cache(maxsize=1)
def volcano_body():
    rgb = np.uint8(first_frame("HTTN05") * 255)
    body = locate(rgb) > .35
    h = body.shape[0]
    # The lower mountain is supporting foreground even when not salient.
    body[int(h * .72):] = True
    return cv2.GaussianBlur(filled(body), (5, 5), .8)


@lru_cache(maxsize=1)
def palm_ground():
    f = first_frame("HTTN08")
    h, w = f.shape[:2]
    y, x = np.mgrid[:h, :w]
    ground = ((f[:, :, 1] > f[:, :, 2]) | (f[:, :, 0] > f[:, :, 2])) & (y > h * .75)
    ground = cv2.morphologyEx(np.uint8(ground), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    # Keep the printed-looking island base and its dark supporting soil.
    ground = np.maximum.accumulate(ground, axis=0)
    return cv2.GaussianBlur(ground.astype(np.float32), (3, 3), .5)


@lru_cache(maxsize=1)
def geyser_rock():
    f = first_frame("HTTN11")
    h = f.shape[0]
    warm = (f[:, :, 0] - f[:, :, 2] > .065) & (np.arange(h)[:, None] > h * .45)
    warm = cv2.morphologyEx(np.uint8(warm), cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
    body = np.maximum.accumulate(warm, axis=0).astype(np.float32)
    return cv2.GaussianBlur(body, (9, 9), 1.5)


def occulting_disk(f):
    small = cv2.resize(f, (640, 360))
    binary = np.uint8(small.max(2) > 90 / 255) * 255
    edge = cv2.morphologyEx(binary, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    y, x = np.mgrid[:360, :640]
    yy, xx = np.nonzero((edge > 0) & ((x - 320) ** 2 + (y - 180) ** 2 < 140 ** 2))
    points = np.c_[xx, yy][::3]
    best, score = None, 70
    rng = np.random.default_rng(42)
    if len(points) >= 70:
        for _ in range(160):
            sample = points[rng.choice(len(points), 3, replace=False)]
            try:
                cx, cy, c = np.linalg.solve(np.c_[2 * sample, np.ones(3)], (sample * sample).sum(1))
                radius2 = c + cx * cx + cy * cy
                if radius2 <= 0:
                    continue
                radius = np.sqrt(radius2)
            except np.linalg.LinAlgError:
                continue
            if not (90 < radius < 150 and 315 < cx < 640 and 140 < cy < 220):
                continue
            error = np.abs(np.hypot(points[:, 0] - cx, points[:, 1] - cy) - radius)
            count = int((error < 2).sum())
            if count > score:
                score, best = count, (cx, cy, radius)
    disk = np.zeros((360, 640), np.float32)
    if best is not None:
        cx, cy, radius = best
        disk = np.float32((x - cx) ** 2 + (y - cy) ** 2 < (radius - 2) ** 2)
    return cv2.resize(disk, (f.shape[1], f.shape[0])), best is None


def entering_moon(f):
    """Fit the outside lunar limb; the lit/dark terminator is not its outline."""
    h, w = f.shape[:2]
    y, x = np.mgrid[:h, :w]
    neutral = ((f[:, :, 0] < f[:, :, 1] * 1.6) & (f[:, :, 1] < f[:, :, 2] * 2)
               & (f.max(2) > .04) & (x > w*.55) & (y > h*.09) & (y < h*.91))
    for mask in [neutral, neutral & (f.max(2) < .65)]:
        ys = np.flatnonzero(mask.any(1))
        xs = np.argmax(mask, axis=1)
        points = np.c_[xs[ys], ys][::2]
        if len(points) < 50:
            continue
        best, score = None, 50
        rng = np.random.default_rng(42)
        for _ in range(240):
            sample = points[rng.choice(len(points), 3, replace=False)]
            try:
                cx, cy, z = np.linalg.solve(np.c_[2*sample, np.ones(3)], (sample*sample).sum(1))
                radius2 = z + cx*cx + cy*cy
                if radius2 <= 0:
                    continue
                radius = np.sqrt(radius2)
            except np.linalg.LinAlgError:
                continue
            if not (w*.58 < cx < w*1.4 and h*.38 < cy < h*.62 and h*.23 < radius < h*.42):
                continue
            count = int((np.abs(np.hypot(points[:, 0]-cx, points[:, 1]-cy)-radius) < 5).sum())
            if count > score:
                score, best = count, (cx, cy, radius)
        if best is not None:
            cx, cy, radius = best
            return np.float32((x-cx)**2 + (y-cy)**2 < (radius-4)**2)
    return np.zeros((h, w), np.float32)


def matte(rgb, aid):
    f = rgb.astype(np.float32) / 255
    h, w = f.shape[:2]
    if aid in {"HTTN01", "HTTN03"}:
        alpha = np.clip((1 - f.min(2) - .012) / .12, 0, 1)
        color = unassociate(f, alpha, 1)
        # The tornado clouds are cropped by the original source frame.
        alpha *= edge_fade((h, w), 24 if aid == "HTTN03" else 12, empty=12 if aid == "HTTN01" else 4)
    elif aid in {"HTTN02", "HTTN07"}:
        backdrop = cv2.GaussianBlur(first_frame(aid), (81, 81), 20)
        alpha = np.clip((np.max(f - backdrop, axis=2) - .018) / .55, 0, 1)
        if aid == "HTTN07":
            # Remove near-invisible backdrop grain before unassociating RGB;
            # dividing that grain by tiny alpha creates huge noisy video files.
            alpha = np.clip((np.max(f - backdrop, axis=2) - .035) / .55, 0, 1)
            alpha[alpha < .025] = 0
            alpha = cv2.GaussianBlur(alpha, (3, 3), .5)
        if aid == "HTTN02":
            green = np.uint8(f[:, :, 1] - np.maximum(f[:, :, 0], f[:, :, 2]) > .025)
            green = cv2.morphologyEx(green, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
            body = np.maximum.accumulate(green, axis=0)
            body = cv2.GaussianBlur(body.astype(np.float32), (5, 5), .8)
            alpha = np.maximum(alpha, body)
        color = unassociate(f, alpha, backdrop)
        alpha *= edge_fade((h, w), 12, empty=12 if aid == "HTTN07" else 4)
    elif aid == "HTTN05":
        alpha = np.clip((f.max(2) - .045) / .45, 0, 1)
        alpha = np.maximum(alpha, volcano_body())
        color = unassociate(f, alpha)
        alpha *= edge_fade((h, w), 20)
    elif aid == "HTTN06":
        # The source fills the frame. Use cloud luminance plus a feathered
        # perimeter to present an atmospheric effect without an opaque sky box.
        alpha = np.clip((f.max(2) - .035) / .16, 0, 1)
        color = f
        y, x = np.mgrid[-1:1:complex(h), -1:1:complex(w)]
        alpha *= np.clip((1 - x*x - y*y) / .45, 0, 1)
        alpha *= edge_fade((h, w), 40)
    elif aid == "HTTN08":
        prediction = locate(rgb)
        green = (f[:, :, 1] - np.maximum(f[:, :, 0], f[:, :, 2]) > -.005) & (f[:, :, 1] > .035)
        # Hard opaque bodies keep palm trunks from becoming transparent.
        # Green fronds remain foreground even when the locator briefly drops
        # an entire wind-blown canopy. The backdrop is blue; requiring excess
        # over BOTH red and blue avoids preserving its rain/sky texture.
        strong_green = f[:, :, 1] - np.maximum(f[:, :, 0], f[:, :, 2]) > .02
        body = np.uint8((prediction > .4) | (green & (prediction > .08)) | strong_green)
        body = cv2.morphologyEx(body, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        alpha = cv2.GaussianBlur(body.astype(np.float32), (3, 3), .5)
        alpha = np.maximum(alpha, palm_ground())
        color = f
        alpha *= edge_fade((h, w), 12, empty=12)
    elif aid == "HTTN11":
        alpha = np.clip((f.max(2) - .025) / .6, 0, 1)
        alpha = np.maximum(alpha, geyser_rock())
        color = unassociate(f, alpha)
        alpha *= edge_fade((h, w), 14, empty=12)
    elif aid == "HTTN14":
        # Fill the complete illuminated Sun contour, including the occulting
        # black disk. The disk must occlude the camera instead of being keyed.
        bright = np.uint8(f.max(2) > .65)
        bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
        core = filled(bright)
        # The occulting central disk is dark foreground, including totality.
        y, x = np.mgrid[:h, :w]
        central_disk = ((x - w * .5) ** 2 + (y - h * .5) ** 2) < (h * .255) ** 2
        core = np.maximum(core, central_disk)
        moon, _ = occulting_disk(f)
        core = np.maximum(core, moon)
        # During entry the Moon still crosses the right source edge. Its gray
        # limb is visible, while the dark side belongs to the same solid disk.
        core = np.maximum(core, entering_moon(f))
        core = cv2.GaussianBlur(core, (5, 5), .8)
        alpha = np.maximum(np.clip((f.max(2) - .015) / .65, 0, 1), core)
        color = unassociate(f, alpha)
        alpha *= edge_fade((h, w), 10, empty=12)
    elif aid == "HTTN15":
        alpha = np.clip((f.max(2) - .008) / .992, 0, 1)
        color = unassociate(f, alpha)
        alpha *= edge_fade((h, w), 8)
    else:
        raise ValueError(aid)
    # Clear invisible RGB, especially beside the packed RGB/matte seam. Color
    # in zero-alpha padding can ring into the matte during H.264 compression.
    color = np.where(alpha[..., None] < .004, 0, color)
    return np.uint8(np.clip(color * 255, 0, 255)), np.uint8(np.clip(alpha * 255, 0, 255))
