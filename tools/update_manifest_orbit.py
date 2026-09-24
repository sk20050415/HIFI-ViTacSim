#!/usr/bin/env python3
"""Refresh orbit geometry from copied camera and calibration inputs."""

import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
TABLETOP_CENTER_ROBOT = np.array([0.6660, -0.385193, 0.585, 1.0])


def main() -> None:
    camera_path = ROOT / ".tmp/source_snapshots/inputs/cameras.json"
    scene_path = ROOT / ".tmp/source_snapshots/inputs/scene.json"
    manifest_path = ROOT / "public/assets/scene-manifest.json"
    cameras = {item["img_name"]: item for item in json.loads(camera_path.read_text())}
    valid_cameras = []
    for sequence_id in range(1, 385):
        item = cameras.get(f"3DGS_Table_{sequence_id:03d}.jpg")
        if item is None:
            continue
        valid_cameras.append(item)

    scene = json.loads(scene_path.read_text())
    base_from_gs = np.asarray(scene["transforms"]["T_base_from_tag"]) @ np.asarray(
        scene["transforms"]["T_tag_from_scene"]
    )
    center = (np.linalg.inv(base_from_gs) @ TABLETOP_CENTER_ROBOT)[:3]
    units_per_meter = float(1.0 / np.cbrt(abs(np.linalg.det(base_from_gs[:3, :3]))))
    up = np.linalg.inv(base_from_gs[:3, :3]) @ np.array([0.0, 0.0, 1.0])
    up /= np.linalg.norm(up)

    manifest = json.loads(manifest_path.read_text())
    manifest["table"]["center"] = center.tolist()
    manifest["table"]["centerRobotMeters"] = TABLETOP_CENTER_ROBOT[:3].tolist()
    manifest["orbit"]["worldUp"] = up.tolist()
    manifest["orbit"]["unitsPerMeter"] = units_per_meter
    manifest["orbit"]["referencePosition"] = valid_cameras[0]["position"]
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"center": center.tolist(), "worldUp": up.tolist(), "unitsPerMeter": units_per_meter}, indent=2))


if __name__ == "__main__":
    main()
