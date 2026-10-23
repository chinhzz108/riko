#!/usr/bin/env python3
"""Transcode the mapped Riko AR clips to browser-friendly WebM."""

from __future__ import annotations

import json
import os
import argparse
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGETS = ROOT / "src/data/arTargets.json"
SOURCE_DIR = ROOT / "MAM_BOOK_AR/ORIGINAL_DOWNLOADS"
OUTPUT_DIR = ROOT / "public/videos/ar"
MASCOT_SOURCE = ROOT / "public/videos/riko-mascot.mp4"
ALPHA_MOV_DIR = ROOT / "MAM_BOOK_AR/AUDIO_DELIVERY/ALPHA_MOV"
ALPHA_FALLBACK_DIR = OUTPUT_DIR / "fallback"
TRUE_ALPHA_IDS = {
    "DV01", "DV06", "GT02", "GT05", "GT09", "GT10",
    "HTTN01", "HTTN03", "HTTN07", "HTTN12", "HTTN13", "HTTN15",
}

PAGE_VIDEO_ASSETS = {
    "RIKO": {
        "kind": "mascot",
        "pages": [
            "book-c1-p01", "book-c1-p02", "book-c1-p14",
            "book-c2-p01", "book-c2-p02", "book-c2-p19",
            "book-c3-p01", "book-c3-p02", "book-c3-p21",
        ],
    },
    "RECAP_GT": {"kind": "recap", "targets": [f"GT{i:02}" for i in range(1, 11)], "pages": ["book-c1-p13"]},
    "RECAP_DV_MAMMALS": {"kind": "chapter-intro", "targets": ["DV01", "DV02"], "pages": ["book-c2-p03"]},
    "RECAP_DV_BIRDS": {"kind": "chapter-intro", "targets": ["DV03", "DV04"], "pages": ["book-c2-p06"]},
    "RECAP_DV_REPTILES": {"kind": "chapter-intro", "targets": ["DV05", "DV06"], "pages": ["book-c2-p09"]},
    "RECAP_DV_AMPHIBIANS": {"kind": "chapter-intro", "targets": ["DV07", "DV08"], "pages": ["book-c2-p12"]},
    "RECAP_DV_INSECTS": {"kind": "chapter-intro", "targets": ["DV09", "DV10"], "pages": ["book-c2-p15"]},
    "RECAP_DV": {"kind": "recap", "targets": [f"DV{i:02}" for i in range(1, 11)], "pages": ["book-c2-p18"]},
    "RECAP_HTTN_A": {
        "kind": "recap",
        "targets": ["HTTN01", "HTTN02", "HTTN03", "HTTN08", "HTTN04", "HTTN09", "HTTN05", "HTTN10", "HTTN06", "HTTN07"],
        "pages": ["book-c3-p19"],
    },
    "RECAP_HTTN_B": {
        "kind": "recap",
        "targets": ["HTTN11", "HTTN12", "HTTN13", "HTTN14", "HTTN15"],
        "pages": ["book-c3-p20"],
    },
}

RECAP_SECONDS_PER_TARGET = 1.15


def ffmpeg_executable() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    local_app_data = Path(os.environ.get("LOCALAPPDATA", ""))
    candidates = list(
        (local_app_data / "Microsoft/WinGet/Packages").glob(
            "Gyan.FFmpeg.Essentials_*/ffmpeg-*/bin/ffmpeg.exe"
        )
    )
    if candidates:
        return str(candidates[-1])
    raise FileNotFoundError("FFmpeg not found. Install the Essentials build from gyan.dev.")


def run_if_stale(command: list[str], destination: Path, sources: list[Path], force: bool = False) -> None:
    if not force and os.environ.get("RIKO_AR_FORCE") != "1" and destination.is_file() and destination.stat().st_size > 0 and all(
        destination.stat().st_mtime >= source.stat().st_mtime for source in sources
    ):
        return
    subprocess.run(command, check=True)


def make_safari_fallbacks(ffmpeg: str, webm: Path, color: Path, matte: Path) -> None:
    """Create synchronized H.264 color/matte streams from a VP9 alpha master."""
    decode_args = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-c:v", "libvpx-vp9", "-i", str(webm)]
    subprocess.run(decode_args + [
        "-filter_complex", "[0:v]format=yuv420p[v]", "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(color),
    ], check=True)
    subprocess.run(decode_args + [
        "-filter_complex", "[0:v]alphaextract,format=gray,format=yuv420p[v]", "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(matte),
    ], check=True)


def transcode_page_asset(ffmpeg: str, asset_id: str, definition: dict, targets_by_id: dict, force: bool = False) -> dict:
    destination = OUTPUT_DIR / f"{asset_id}.webm"
    if asset_id == "RIKO":
        if not MASCOT_SOURCE.is_file():
            raise FileNotFoundError(MASCOT_SOURCE)
        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(MASCOT_SOURCE),
            "-filter_complex",
            "[0:v]scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:color=0x27d048,chromakey=0x27d048:0.10:0.02,format=yuva420p[fg];"
            "color=c=0xfffff2:s=540x960:r=24:d=10[bg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[out]",
            "-map", "[out]", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
            "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-crf", "34", "-b:v", "0",
            str(destination),
        ]
        sources = [MASCOT_SOURCE]
    else:
        source_targets = [targets_by_id[target_id] for target_id in definition["targets"]]
        sources = [ROOT / target["sourceMp4"] for target in source_targets]
        if len(sources) != len(definition["targets"]):
            raise ValueError(f"A source clip is missing for {asset_id}")
        command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
        for source in sources:
            if not source.is_file():
                raise FileNotFoundError(source)
            command.extend(["-ss", "0.4", "-t", str(RECAP_SECONDS_PER_TARGET), "-i", str(source)])
        filters = []
        labels = []
        for index in range(len(sources)):
            label = f"v{index}"
            filters.append(
                f"[{index}:v]trim=duration={RECAP_SECONDS_PER_TARGET},setpts=PTS-STARTPTS,"
                "scale=480:270:force_original_aspect_ratio=decrease,"
                "pad=480:270:(ow-iw)/2:(oh-ih)/2:color=0xfffff2,setsar=1,fps=24,format=yuv420p"
                f"[{label}]"
            )
            labels.append(f"[{label}]")
        filters.append(f"{''.join(labels)}concat=n={len(sources)}:v=1:a=0[out]")
        command.extend([
            "-filter_complex", ";".join(filters), "-map", "[out]", "-an", "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuv420p", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
            "-crf", "36", "-b:v", "0", str(destination),
        ])
    run_if_stale(command, destination, sources, force=force)
    return {
        "id": asset_id,
        "url": f"/videos/ar/{asset_id}.webm",
        "kind": definition["kind"],
        "targets": definition.get("targets", []),
        "bytes": destination.stat().st_size,
        "pages": definition["pages"],
    }


def encode_alpha_pair(
    ffmpeg: str,
    asset_id: str,
    source: Path,
    *,
    keyed_green: bool = False,
    force: bool = False,
) -> dict:
    """Create a VP9 alpha master and H.264 color/matte assets for Safari."""
    webm = OUTPUT_DIR / f"{asset_id}.webm"
    color = ALPHA_FALLBACK_DIR / f"{asset_id}-color.mp4"
    matte = ALPHA_FALLBACK_DIR / f"{asset_id}-alpha.mp4"
    ALPHA_FALLBACK_DIR.mkdir(parents=True, exist_ok=True)
    have_alpha_manifest = False
    manifest_path = OUTPUT_DIR / "manifest.json"
    if manifest_path.is_file():
        try:
            have_alpha_manifest = any(
                item.get("id") == asset_id and item.get("alpha") is True
                for item in json.loads(manifest_path.read_text(encoding="utf-8"))
            )
        except (json.JSONDecodeError, AttributeError):
            pass
    rebuild = force or not have_alpha_manifest or any(not path.is_file() or path.stat().st_size == 0 for path in (webm, color, matte))

    if rebuild:
        if keyed_green:
            key_filter = (
                "scale=540:960:force_original_aspect_ratio=decrease,"
                "pad=540:960:(ow-iw)/2:(oh-ih)/2:color=0x27d048,"
                "chromakey=0x27d048:0.10:0.08,"
            )
        else:
            key_filter = ""
        alpha_filter = (
            f"[0:v]{key_filter}scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,"
            "setsar=1,format=yuva420p[v]"
        )
        alpha_command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            # The mascot source fades in over black before switching to its green key backdrop.
            # Trim that opening so every delivered frame can actually carry transparency.
            *(["-ss", "0.5"] if keyed_green else []),
            "-i", str(source), "-filter_complex", alpha_filter,
            "-map", "[v]", "-map", "0:a?", "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
            "-metadata:s:v:0", "alpha_mode=1", "-deadline", "good",
            "-cpu-used", "4", "-row-mt", "1", "-crf", "30", "-b:v", "0",
            "-c:a", "libopus", "-b:a", "96k", str(webm),
        ]
        subprocess.run(alpha_command, check=True)

        make_safari_fallbacks(ffmpeg, webm, color, matte)

    return {
        "id": asset_id,
        "alpha": True,
        "alphaVideoUrl": f"/videos/ar/{asset_id}.webm",
        "alphaColorUrl": f"/videos/ar/fallback/{asset_id}-color.mp4",
        "alphaMaskUrl": f"/videos/ar/fallback/{asset_id}-alpha.mp4",
        "alphaBytes": webm.stat().st_size,
        "fallbackBytes": color.stat().st_size + matte.stat().st_size,
    }


def build_alpha_assets(ffmpeg: str, force: bool = False) -> dict[str, dict]:
    alpha_assets: dict[str, dict] = {}
    for asset_id in sorted(TRUE_ALPHA_IDS):
        sources = list(ALPHA_MOV_DIR.rglob(f"{asset_id}-*-alpha.mov"))
        if len(sources) != 1:
            raise FileNotFoundError(f"Expected one true-alpha ProRes master for {asset_id}, found {len(sources)}")
        alpha_assets[asset_id] = encode_alpha_pair(ffmpeg, asset_id, sources[0], force=force)
        print(f"[alpha] {asset_id} {alpha_assets[asset_id]['alphaBytes']:,} bytes WebM")

    if not MASCOT_SOURCE.is_file():
        raise FileNotFoundError(MASCOT_SOURCE)
    alpha_assets["RIKO"] = encode_alpha_pair(ffmpeg, "RIKO", MASCOT_SOURCE, keyed_green=True, force=force)
    print(f"[alpha] RIKO {alpha_assets['RIKO']['alphaBytes']:,} bytes WebM (green-screen key)")
    return alpha_assets


def build_alpha_recaps(ffmpeg: str, force: bool = False) -> dict[str, dict]:
    """Concatenate the already-transparent page clips into transparent recap clips."""
    manifest_path = OUTPUT_DIR / "manifest.json"
    try:
        alpha_ids = {
            item.get("id")
            for item in json.loads(manifest_path.read_text(encoding="utf-8"))
            if item.get("alpha") is True
        }
    except (FileNotFoundError, json.JSONDecodeError, AttributeError):
        alpha_ids = set()

    assets: dict[str, dict] = {}
    for asset_id, definition in PAGE_VIDEO_ASSETS.items():
        if asset_id == "RIKO":
            continue
        webm = OUTPUT_DIR / f"{asset_id}.webm"
        color = ALPHA_FALLBACK_DIR / f"{asset_id}-color.mp4"
        matte = ALPHA_FALLBACK_DIR / f"{asset_id}-alpha.mp4"
        sources = [OUTPUT_DIR / f"{target_id}.webm" for target_id in definition["targets"]]
        if any(not source.is_file() or source.stat().st_size == 0 for source in sources):
            missing = [str(source) for source in sources if not source.is_file() or source.stat().st_size == 0]
            raise FileNotFoundError(f"Transparent recap inputs are missing for {asset_id}: {missing}")

        rebuild = force or asset_id not in alpha_ids or any(
            not path.is_file() or path.stat().st_size == 0 for path in (webm, color, matte)
        ) or any(webm.stat().st_mtime < source.stat().st_mtime for source in sources)
        if rebuild:
            command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
            for source in sources:
                command.extend(["-c:v", "libvpx-vp9", "-ss", "0.4", "-t", str(RECAP_SECONDS_PER_TARGET), "-i", str(source)])
            filters = []
            labels = []
            for index in range(len(sources)):
                label = f"v{index}"
                filters.append(
                    f"[{index}:v]trim=duration={RECAP_SECONDS_PER_TARGET},setpts=PTS-STARTPTS,"
                    "scale=480:270:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,"
                    "pad=480:270:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,fps=24,format=yuva420p"
                    f"[{label}]"
                )
                labels.append(f"[{label}]")
            filters.append(f"{''.join(labels)}concat=n={len(sources)}:v=1:a=0[out]")
            command.extend([
                "-filter_complex", ";".join(filters), "-map", "[out]", "-an", "-c:v", "libvpx-vp9",
                "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1",
                "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-crf", "32", "-b:v", "0", str(webm),
            ])
            subprocess.run(command, check=True)
            make_safari_fallbacks(ffmpeg, webm, color, matte)

        assets[asset_id] = {
            "id": asset_id,
            "alpha": True,
            "alphaVideoUrl": f"/videos/ar/{asset_id}.webm",
            "alphaColorUrl": f"/videos/ar/fallback/{asset_id}-color.mp4",
            "alphaMaskUrl": f"/videos/ar/fallback/{asset_id}-alpha.mp4",
            "alphaBytes": webm.stat().st_size,
            "fallbackBytes": color.stat().st_size + matte.stat().st_size,
        }
        print(f"[alpha recap] {asset_id} {assets[asset_id]['alphaBytes']:,} bytes WebM")
    return assets


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--page-assets-only", action="store_true", help="Skip the 35 base video transcodes")
    parser.add_argument("--force-page-assets", action="store_true", help="Rebuild the generated mascot and recap clips")
    parser.add_argument("--force-alpha", action="store_true", help="Rebuild the transparent VP9 clips and Safari fallbacks")
    args = parser.parse_args()
    ffmpeg = ffmpeg_executable()
    targets = json.loads(TARGETS.read_text(encoding="utf-8"))["targets"]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    targets_by_id = {target["id"]: target for target in targets}
    prior_alpha_assets: dict[str, dict] = {}
    previous_manifest_path = OUTPUT_DIR / "manifest.json"
    if previous_manifest_path.is_file():
        try:
            for item in json.loads(previous_manifest_path.read_text(encoding="utf-8")):
                if item.get("alpha") is True:
                    prior_alpha_assets[item["id"]] = {
                        key: item[key]
                        for key in ("alpha", "alphaVideoUrl", "alphaColorUrl", "alphaMaskUrl")
                        if key in item
                    }
        except (json.JSONDecodeError, AttributeError, KeyError):
            pass
    if args.page_assets_only:
        current_manifest = json.loads((OUTPUT_DIR / "manifest.json").read_text(encoding="utf-8"))
        converted = [item for item in current_manifest if item["id"] in targets_by_id]
    else:
        converted = []

    if not args.page_assets_only:
        for index, target in enumerate(targets, start=1):
            source = ROOT / target["sourceMp4"]
            destination = OUTPUT_DIR / f"{target['id']}.webm"
            if not source.is_file():
                raise FileNotFoundError(source)
            if (
                not destination.is_file()
                or destination.stat().st_size == 0
                or destination.stat().st_mtime < source.stat().st_mtime
            ):
                command = [
                    ffmpeg,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(source),
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a?",
                    "-c:v",
                    "libvpx-vp9",
                    "-pix_fmt",
                    "yuv420p",
                    "-deadline",
                    "good",
                    "-cpu-used",
                    "4",
                    "-row-mt",
                    "1",
                    "-crf",
                    "31",
                    "-b:v",
                    "0",
                    "-c:a",
                    "libopus",
                    "-b:a",
                    "96k",
                    str(destination),
                ]
                subprocess.run(command, check=True)
            converted.append(
                {
                    "id": target["id"],
                    "url": f"/videos/ar/{target['id']}.webm",
                    "source": target["sourceMp4"],
                    "bytes": destination.stat().st_size,
                    "pages": target["pages"],
                }
            )
            print(f"[{index:02}/{len(targets):02}] {target['id']} {destination.stat().st_size:,} bytes")

    page_assets = []
    for index, (asset_id, definition) in enumerate(PAGE_VIDEO_ASSETS.items(), start=1):
        page_assets.append(transcode_page_asset(ffmpeg, asset_id, definition, targets_by_id, force=args.force_page_assets))
        print(f"[page {index:02}/{len(PAGE_VIDEO_ASSETS):02}] {asset_id} {page_assets[-1]['bytes']:,} bytes")

    alpha_assets = build_alpha_assets(ffmpeg, force=args.force_alpha)
    alpha_assets.update(build_alpha_recaps(ffmpeg, force=args.force_alpha or args.force_page_assets))
    for item in converted + page_assets:
        item.update(alpha_assets.get(item["id"], prior_alpha_assets.get(item["id"], {})))
        if item["id"] in alpha_assets:
            item["bytes"] = (OUTPUT_DIR / f"{item['id']}.webm").stat().st_size

    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(converted + page_assets, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "targetClips": len(converted),
        "pageAssets": len(page_assets),
        "alphaAssets": len(alpha_assets),
        "totalBytes": sum(item["bytes"] for item in converted + page_assets),
    }))


if __name__ == "__main__":
    main()
