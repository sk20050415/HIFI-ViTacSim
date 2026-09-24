#!/usr/bin/env python3
"""Build honest pixel-aligned comparison views from local source snapshots."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / ".tmp/source_snapshots"
PUBLIC = ROOT / "public/assets"
VIEW_IDS = (1, 96, 192, 288, 384)
ORIGINAL_IMAGES = Path(
    "/media/sa-lab/3E1CC91C1CC8CFD7/3DGS-official/data/table_cloth_new/images"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    camera_path = SNAPSHOT / "inputs/cameras.json"
    cameras = {
        item["img_name"]: item
        for item in json.loads(camera_path.read_text(encoding="utf-8"))
    }
    views = []
    hashes_path = ROOT / ".source-hashes.json"
    hashes = json.loads(hashes_path.read_text(encoding="utf-8"))

    for view_id in VIEW_IDS:
        name = f"3DGS_Table_{view_id:03d}.jpg"
        copied_image = SNAPSHOT / "real_calibrated" / name
        if not copied_image.is_file():
            raise SystemExit(f"Missing copied source snapshot: {copied_image}")
        camera = cameras[name]
        output_dir = PUBLIC / "views" / str(view_id)
        output_dir.mkdir(parents=True, exist_ok=True)
        with Image.open(copied_image) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((2560, 1920), Image.Resampling.LANCZOS)
            image.save(output_dir / "real.webp", "WEBP", quality=96, method=6)

        rotation = np.asarray(camera["rotation"], dtype=float)
        position = np.asarray(camera["position"], dtype=float)
        forward = rotation[:, 2]
        up = -rotation[:, 1]
        vertical_fov = math.degrees(
            2.0 * math.atan(float(camera["height"]) / (2.0 * float(camera["fy"])))
        )
        views.append(
            {
                "id": str(view_id),
                "label": f"View {view_id}",
                "real": f"./assets/views/{view_id}/real.webp",
                "realSourceSha256": sha256(copied_image),
                "camera": {
                    "width": int(camera["width"]),
                    "height": int(camera["height"]),
                    "fx": float(camera["fx"]),
                    "fy": float(camera["fy"]),
                    "position": position.tolist(),
                    "rotation": rotation.tolist(),
                    "target": (position + forward).tolist(),
                    "up": up.tolist(),
                    "verticalFov": vertical_fov,
                },
            }
        )
        original = ORIGINAL_IMAGES / name
        hashes[str(original)] = sha256(original)

    manifest_path = PUBLIC / "scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["views"] = views
    manifest["orbit"]["referencePosition"] = views[0]["camera"]["position"]
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    hashes_path.write_text(json.dumps(hashes, indent=2, sort_keys=True), encoding="utf-8")
    print(f"Prepared {len(views)} aligned comparison views from copied snapshots.")


if __name__ == "__main__":
    main()
