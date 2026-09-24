#!/usr/bin/env python3
"""Fit copied Neural mesh exports to the interactive 3DGS tabletop frame."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh


ROOT = Path(__file__).resolve().parents[1]


def srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    normalized = rgb.astype(np.float32) / 255.0
    return np.where(
        normalized <= 0.04045,
        normalized / 12.92,
        ((normalized + 0.055) / 1.055) ** 2.4,
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=float, default=0.46)
    args = parser.parse_args()
    manifest_path = ROOT / "public/assets/scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    target_center = np.asarray(manifest["table"]["center"], dtype=float)

    for label in ("high", "mobile"):
        backup = ROOT / f".tmp/table_cloth_neural_{label}.pre_visual_fit.glb"
        output = ROOT / f"public/assets/scene/table_cloth_neural_{label}.glb"
        scene = trimesh.load(backup, force="scene")
        matrix = np.eye(4)
        matrix[:3, :3] *= args.scale
        # The pre-fit export is already registered to the 3DGS scene. Scale
        # about the calibrated tabletop surface, not the full scan bounds: the
        # latter include floor fragments and incorrectly pull the table away.
        matrix[:3, 3] = target_center * (1.0 - args.scale)
        scene.apply_transform(matrix)
        for geometry in scene.geometry.values():
            colors = np.asarray(geometry.visual.vertex_colors, dtype=np.uint8)
            linear = np.clip(
                srgb_to_linear(colors[:, :3]) * 255.0 + 0.5,
                0,
                255,
            ).astype(np.uint8)
            geometry.visual.vertex_colors = np.column_stack((linear, colors[:, 3]))
        output.write_bytes(scene.export(file_type="glb"))
        entry = manifest["models"]["neural"][label]
        entry["bytes"] = output.stat().st_size
        entry["sha256"] = sha256(output)

    manifest["models"]["neural"]["webVisualFit"] = {
        "scaleFromRegisteredUsdExport": args.scale,
        "targetCenter": target_center.tolist(),
        "pivot": "calibrated tabletop focus",
        "note": "Web-display fit and USD-linear colors derived only from presentation-local GLB copies",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest["models"]["neural"]["webVisualFit"], indent=2))


if __name__ == "__main__":
    main()
