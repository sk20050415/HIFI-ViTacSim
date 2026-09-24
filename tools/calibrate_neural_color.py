#!/usr/bin/env python3
"""Match presentation-local Neural GLB colors to the USD displayColor values."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
import trimesh


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    normalized = rgb.astype(np.float32) / 255.0
    return np.where(
        normalized <= 0.04045,
        normalized / 12.92,
        ((normalized + 0.055) / 1.055) ** 2.4,
    )


def main() -> None:
    manifest_path = ROOT / "public/assets/scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for label in ("high", "mobile"):
        output = ROOT / f"public/assets/scene/table_cloth_neural_{label}.glb"
        backup = ROOT / f".tmp/table_cloth_neural_{label}.pre_color_calibration.glb"
        if not backup.exists():
            shutil.copy2(output, backup)
        scene = trimesh.load(backup, force="scene")
        for geometry in scene.geometry.values():
            colors = np.asarray(geometry.visual.vertex_colors, dtype=np.uint8)
            linear = np.clip(
                srgb_to_linear(colors[:, :3]) * 255.0 + 0.5,
                0,
                255,
            ).astype(np.uint8)
            geometry.visual.vertex_colors = np.column_stack((linear, colors[:, 3]))
        output.write_bytes(scene.export(file_type="glb"))
        manifest["models"]["neural"][label]["bytes"] = output.stat().st_size
        manifest["models"]["neural"][label]["sha256"] = sha256(output)
    manifest["models"]["neural"]["colorEncoding"] = {
        "source": "PLY sRGB vertex colors",
        "webAsset": "linear RGB matching USD displayColor",
        "material": "UsdPreviewSurface roughness=0.85 metallic=0 specular=0.15",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
