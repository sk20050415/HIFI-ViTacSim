#!/usr/bin/env python3
"""Prepare browser-compatible policy rollout videos from read-only sources."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / ".tmp" / "source_snapshots" / "evaluation"
OUTPUT = ROOT / "public" / "assets" / "evaluation"

SIMULATION = {
    "toy-box-neural": (
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/neural_data_notactile_lerobot21/toy_box_normal70+abnormal30_neural_default_environment__3calib_09_16/videos/chunk-000/observation.images.cam_high/episode_000020.mp4"),
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/neural_data_notactile_lerobot21/toy_box_normal70+abnormal30_neural_default_environment__3calib_09_16/videos/chunk-000/observation.images.cam_wrist/episode_000020.mp4"),
    ),
    "toy-box-3dgs": (
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/3dgs_data_notactile_lerobot21/toy_box_normal70+abnormal30_3dgs_default_environment__3calib_09_16/videos/chunk-000/observation.images.cam_high/episode_000020.mp4"),
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/3dgs_data_notactile_lerobot21/toy_box_normal70+abnormal30_3dgs_default_environment__3calib_09_16/videos/chunk-000/observation.images.cam_wrist/episode_000020.mp4"),
    ),
    "red-ring-neural": (
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/neural_data_notactile_lerobot21/red_ring_table_cloth_latestcamhigh_09_05/videos/chunk-000/observation.images.cam_high/episode_000008.mp4"),
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/neural_data_notactile_lerobot21/red_ring_table_cloth_latestcamhigh_09_05/videos/chunk-000/observation.images.cam_wrist/episode_000008.mp4"),
    ),
    "red-ring-3dgs": (
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/3dgs_data_notactile_lerobot21/red_ring_cloth_table_3dgs_newcollsion_09_08/videos/chunk-000/observation.images.cam_high/episode_000019.mp4"),
        Path("/media/sa-lab/3E1CC91C1CC8CFD7/3dgs_data_notactile_lerobot21/red_ring_cloth_table_3dgs_newcollsion_09_08/videos/chunk-000/observation.images.cam_wrist/episode_000019.mp4"),
    ),
}

REAL_WORLD = {
    "toy-box-real": ROOT / "assets" / "toy_box_real_deploy.mp4",
    "red-ring-real": ROOT / "assets" / "red_ring_real_deploy.mp4",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def snapshot(source: Path, name: str) -> Path:
    if not source.is_file():
        raise FileNotFoundError(source)
    target = SNAPSHOT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or sha256(target) != sha256(source):
        shutil.copy2(source, target)
    return target


def run_ffmpeg(*arguments: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *arguments], check=True)


def make_poster(video: Path) -> None:
    duration = float(
        subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(video),
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    )
    run_ffmpeg(
        "-ss", f"{duration / 2:.3f}", "-i", str(video), "-frames:v", "1",
        "-c:v", "libwebp", "-quality", "82", str(video.with_suffix(".webp")),
    )


def prepare_simulation(name: str, high_source: Path, wrist_source: Path) -> Path:
    high = snapshot(high_source, f"simulation/{name}-high.mp4")
    wrist = snapshot(wrist_source, f"simulation/{name}-wrist.mp4")
    output = OUTPUT / "simulation" / f"{name}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        "-i", str(high), "-i", str(wrist),
        "-filter_complex",
        "[0:v]scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2[left];"
        "[1:v]scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2[right];"
        "[left][right]hstack=inputs=2[video]",
        "-map", "[video]", "-an", "-shortest", "-r", "30",
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    )
    make_poster(output)
    return output


def prepare_real_world(name: str, source: Path) -> Path:
    copied = snapshot(source, f"real/{source.name}")
    output = OUTPUT / "real" / f"{name}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        "-i", str(copied), "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
        "-an", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    )
    make_poster(output)
    return output


def main() -> None:
    outputs = []
    source_hashes: dict[str, str] = {}
    for name, (high, wrist) in SIMULATION.items():
        outputs.append(prepare_simulation(name, high, wrist))
        source_hashes[str(high)] = sha256(high)
        source_hashes[str(wrist)] = sha256(wrist)
    for name, source in REAL_WORLD.items():
        outputs.append(prepare_real_world(name, source))
        source_hashes[str(source)] = sha256(source)

    hashes_path = ROOT / ".source-hashes.json"
    hashes = json.loads(hashes_path.read_text(encoding="utf-8")) if hashes_path.exists() else {}
    hashes.update(source_hashes)
    hashes_path.write_text(json.dumps(hashes, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"outputs": [str(path) for path in outputs]}, indent=2))


if __name__ == "__main__":
    main()
