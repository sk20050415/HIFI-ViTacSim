#!/usr/bin/env python3
"""Apply the copied USD's uniform inner scale to already simplified GLBs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh


ROOT = Path(__file__).resolve().parents[1]
SCALE = 5.4347826


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    scene = json.loads(
        (ROOT / ".tmp/source_snapshots/inputs/scene.json").read_text(encoding="utf-8")
    )
    pose = json.loads(
        (ROOT / ".tmp/source_snapshots/inputs/table_cloth_relative_pose.json").read_text(
            encoding="utf-8"
        )
    )["cloth_in_robot"]
    base_from_gs = np.asarray(scene["transforms"]["T_base_from_tag"]) @ np.asarray(
        scene["transforms"]["T_tag_from_scene"]
    )
    pivot = (np.linalg.inv(base_from_gs) @ np.r_[pose["translation_m"], 1.0])[:3]
    matrix = np.eye(4)
    matrix[:3, :3] *= SCALE
    matrix[:3, 3] = pivot * (1.0 - SCALE)

    manifest_path = ROOT / "public/assets/scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for label in ("high", "mobile"):
        relative = manifest["models"]["neural"][label]["url"].removeprefix("./assets/")
        path = ROOT / "public/assets" / relative
        loaded = trimesh.load(path, force="scene")
        loaded.apply_transform(matrix)
        path.write_bytes(loaded.export(file_type="glb"))
        manifest["models"]["neural"][label]["bytes"] = path.stat().st_size
        manifest["models"]["neural"][label]["sha256"] = sha256(path)

    manifest["models"]["neural"]["usdInternalScale"] = SCALE
    current = np.asarray(manifest["transforms"]["gaussianFromNeural"])
    current[:3, :3] *= SCALE
    manifest["transforms"]["gaussianFromNeural"] = current.tolist()
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"pivot": pivot.tolist(), "scale": SCALE}, indent=2))


if __name__ == "__main__":
    main()
