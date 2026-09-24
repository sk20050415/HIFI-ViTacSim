#!/usr/bin/env python3
"""Prepare presentation assets without ever writing to source locations.

Every external input is copied to ``presentation/.tmp/source_snapshots`` first.
All transformations operate exclusively on those copies.
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import zipfile
from pathlib import Path

import numpy as np
import open3d as o3d
import trimesh
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / ".tmp" / "source_snapshots"
PUBLIC = ROOT / "public" / "assets"

EXTERNAL = {
    "gaussian_ply": Path(
        "/media/sa-lab/3E1CC91C1CC8CFD7/3DGS-official/output/"
        "table_cloth_new/point_cloud_modified.ply"
    ),
    "cameras_json": Path(
        "/media/sa-lab/3E1CC91C1CC8CFD7/3DGS-official/output/"
        "table_cloth_new/cameras.json"
    ),
    "gs_scene_json": ROOT.parent / "assets/hybrid_scenes/red_ring_table_cloth_v2/scene.json",
    "neural_pose_json": ROOT.parent / "table_cloth_relative_pose.json",
    "neural_mesh": Path(
        "/media/sa-lab/3E1CC91C1CC8CFD7/UniVTAC_new/assets/scene/"
        "table_cloth_2048.ply"
    ),
}
REAL_SOURCE = Path(
    "/media/sa-lab/3E1CC91C1CC8CFD7/3DGS-official/data/"
    "table_cloth_new/images"
)
RAW_REAL_SOURCE = Path("/media/sa-lab/3E1CC91C1CC8CFD7/lhf/3DTables_add")
VIEW_IDS = (1, 96, 192, 288, 384)
RAW_HERO_ID = 434
# Verified from the copied USD at /World/black_table_2048/mesh. The USD wraps
# the original Neuralangelo vertices in this uniform xform before the external
# pose in table_cloth_relative_pose.json is applied.
USD_INTERNAL_SCALE = 5.4347826
TABLETOP_CENTER_ROBOT = np.array([0.6660, -0.385193, 0.585, 1.0])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def copy_source(source: Path, relative: Path) -> Path:
    if not source.is_file():
        raise FileNotFoundError(source)
    target = SNAPSHOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or sha256(target) != sha256(source):
        shutil.copy2(source, target)
    return target


def unpack_sog(archive: Path) -> Path:
    output = PUBLIC / "scene" / "table_cloth_web_sog"
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            target = (output / item.filename).resolve()
            if output.resolve() not in target.parents:
                raise RuntimeError(f"Unsafe SOG archive entry: {item.filename}")
            with bundle.open(item) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)
    return output / "meta.json"


def quaternion_matrix(wxyz: list[float]) -> np.ndarray:
    w, x, y, z = (float(value) for value in wxyz)
    norm = math.sqrt(w * w + x * x + y * y + z * z)
    w, x, y, z = w / norm, x / norm, y / norm, z / norm
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ],
        dtype=np.float64,
    )


def make_transform(rotation: np.ndarray, translation: list[float], scale: float = 1.0) -> np.ndarray:
    matrix = np.eye(4, dtype=np.float64)
    matrix[:3, :3] = rotation * scale
    matrix[:3, 3] = np.asarray(translation, dtype=np.float64)
    return matrix


def export_neural_mesh(source_copy: Path, transform: np.ndarray) -> dict[str, object]:
    scene_dir = PUBLIC / "scene"
    scene_dir.mkdir(parents=True, exist_ok=True)
    high_path = scene_dir / "table_cloth_neural_high.glb"
    mobile_path = scene_dir / "table_cloth_neural_mobile.glb"

    mesh = o3d.io.read_triangle_mesh(str(source_copy), enable_post_processing=False)
    if mesh.is_empty():
        raise RuntimeError(f"Could not load neural mesh: {source_copy}")
    source_triangles = len(mesh.triangles)
    source_vertices = len(mesh.vertices)
    mesh.transform(transform)

    outputs: dict[str, object] = {
        "sourceVertices": source_vertices,
        "sourceTriangles": source_triangles,
    }
    for label, target_count, target_path in (
        ("high", 2_000_000, high_path),
        ("mobile", 350_000, mobile_path),
    ):
        simplified = mesh.simplify_quadric_decimation(
            target_number_of_triangles=target_count,
            boundary_weight=2.0,
        )
        simplified.remove_degenerate_triangles()
        simplified.remove_duplicated_triangles()
        simplified.remove_unreferenced_vertices()
        simplified.compute_vertex_normals()
        vertices = np.asarray(simplified.vertices, dtype=np.float32)
        faces = np.asarray(simplified.triangles, dtype=np.uint32)
        colors_float = np.asarray(simplified.vertex_colors, dtype=np.float32)
        colors = None
        if len(colors_float) == len(vertices):
            rgb = np.clip(colors_float * 255.0 + 0.5, 0, 255).astype(np.uint8)
            colors = np.column_stack((rgb, np.full((len(rgb),), 255, dtype=np.uint8)))
        tri = trimesh.Trimesh(
            vertices=vertices,
            faces=faces,
            vertex_colors=colors,
            process=False,
            validate=False,
        )
        target_path.write_bytes(tri.export(file_type="glb"))
        outputs[label] = {
            "url": f"./assets/scene/{target_path.name}",
            "vertices": int(len(vertices)),
            "triangles": int(len(faces)),
            "bytes": target_path.stat().st_size,
            "sha256": sha256(target_path),
        }
        del simplified, tri, vertices, faces, colors_float, colors
    return outputs


def prepare_real_views(camera_copy: Path) -> tuple[list[dict[str, object]], np.ndarray]:
    cameras = json.loads(camera_copy.read_text(encoding="utf-8"))
    by_name = {camera["img_name"]: camera for camera in cameras}
    result: list[dict[str, object]] = []

    for view_id in VIEW_IDS:
        name = f"3DGS_Table_{view_id:03d}.jpg"
        camera = by_name.get(name)
        if camera is None:
            raise RuntimeError(f"Missing calibrated camera: {name}")
        calibrated_copy = copy_source(REAL_SOURCE / name, Path("real_calibrated") / name)
        view_dir = PUBLIC / "views" / str(view_id)
        view_dir.mkdir(parents=True, exist_ok=True)
        target = view_dir / "real.webp"
        with Image.open(calibrated_copy) as source_image:
            image = ImageOps.exif_transpose(source_image).convert("RGB")
            image.thumbnail((2560, 1920), Image.Resampling.LANCZOS)
            image.save(target, "WEBP", quality=96, method=6)

        rotation = np.asarray(camera["rotation"], dtype=np.float64)
        position = np.asarray(camera["position"], dtype=np.float64)
        # cameras.json stores camera-to-world rotation. COLMAP camera looks +Z,
        # with +Y down; expose both matrix and derived target/up for tooling.
        forward = rotation[:, 2]
        up = -rotation[:, 1]
        vertical_fov = math.degrees(
            2.0 * math.atan(float(camera["height"]) / (2.0 * float(camera["fy"])))
        )
        result.append(
            {
                "id": str(view_id),
                "label": f"View {view_id}",
                "real": f"./assets/views/{view_id}/real.webp",
                "realSourceSha256": sha256(calibrated_copy),
                "calibratedSourceSha256": sha256(calibrated_copy),
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
    # Recover the focus from cameras that belong to this reconstruction. The
    # later 434–530 capture sequence shows a changed tabletop arrangement and
    # its exported poses do not converge on the stored 3DGS scene.
    lhs = np.zeros((3, 3), dtype=np.float64)
    rhs = np.zeros(3, dtype=np.float64)
    for sequence_id in range(1, 385):
        item = by_name.get(f"3DGS_Table_{sequence_id:03d}.jpg")
        if item is None:
            continue
        origin = np.asarray(item["position"], dtype=np.float64)
        direction = np.asarray(item["rotation"], dtype=np.float64)[:, 2]
        direction /= np.linalg.norm(direction)
        projector = np.eye(3) - np.outer(direction, direction)
        lhs += projector
        rhs += projector @ origin
    focus_center = np.linalg.solve(lhs, rhs)
    return result, focus_center


def by_name_reference_position(camera_path: Path) -> list[float]:
    """Return a stable orbit heading from the first reconstruction camera."""
    cameras = json.loads(camera_path.read_text(encoding="utf-8"))
    by_name = {item["img_name"]: item for item in cameras}
    return [float(value) for value in by_name["3DGS_Table_001.jpg"]["position"]]


def main() -> None:
    SNAPSHOT.mkdir(parents=True, exist_ok=True)
    copied = {
        key: copy_source(source, Path("inputs") / source.name)
        for key, source in EXTERNAL.items()
    }

    scene_payload = json.loads(copied["gs_scene_json"].read_text(encoding="utf-8"))
    pose_payload = json.loads(copied["neural_pose_json"].read_text(encoding="utf-8"))
    base_from_gs = np.asarray(
        scene_payload["transforms"]["T_base_from_tag"], dtype=np.float64
    ) @ np.asarray(scene_payload["transforms"]["T_tag_from_scene"], dtype=np.float64)
    pose = pose_payload["cloth_in_robot"]
    scale = float(pose["scale_xyz"][0]) * USD_INTERNAL_SCALE
    base_from_neural = make_transform(
        quaternion_matrix(pose["rotation_wxyz"]), pose["translation_m"], scale
    )
    gs_from_neural = np.linalg.inv(base_from_gs) @ base_from_neural

    neural = export_neural_mesh(copied["neural_mesh"], gs_from_neural)
    views, _camera_ray_focus = prepare_real_views(copied["cameras_json"])
    table_center_gs = (np.linalg.inv(base_from_gs) @ TABLETOP_CENTER_ROBOT)[:3]
    gs_units_per_meter = float(1.0 / np.cbrt(abs(np.linalg.det(base_from_gs[:3, :3]))))
    world_up = np.linalg.inv(base_from_gs[:3, :3]) @ np.array([0.0, 0.0, 1.0])
    world_up /= np.linalg.norm(world_up)

    gs_path = PUBLIC / "scene" / "table_cloth_web.sog"
    gs_meta_path = unpack_sog(gs_path)
    manifest = {
        "version": 1,
        "scene": "table_cloth",
        "coordinateFrame": "3dgs-scene",
        "models": {
            "gaussian": {
                "url": "./assets/scene/table_cloth_web_sog/meta.json",
                "gaussians": 709241,
                "bytes": gs_path.stat().st_size,
                "sha256": sha256(gs_path),
                "metaSha256": sha256(gs_meta_path),
                "shBands": 0,
            },
            "neural": neural,
        },
        "table": {
            "center": table_center_gs.tolist(),
            "centerRobotMeters": TABLETOP_CENTER_ROBOT[:3].tolist(),
            "sizeMeters": [0.7, 1.65],
        },
        "orbit": {
            "yawMin": -70,
            "yawMax": 70,
            "pitchMin": 35,
            "pitchMax": 68,
            "distanceMinMeters": 0.55,
            "distanceMaxMeters": 1.6,
            "panHalfExtentMeters": [0.21, 0.50],
            "worldUp": world_up.tolist(),
            "unitsPerMeter": gs_units_per_meter,
            "referencePosition": by_name_reference_position(copied["cameras_json"]),
        },
        "views": views,
        "transforms": {
            "baseFromGaussian": base_from_gs.tolist(),
            "gaussianFromNeural": gs_from_neural.tolist(),
        },
    }
    manifest_path = PUBLIC / "scene-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    hashes_path = ROOT / ".source-hashes.json"
    source_hashes = (
        json.loads(hashes_path.read_text(encoding="utf-8"))
        if hashes_path.exists()
        else {}
    )
    source_hashes.update({str(source): sha256(source) for source in EXTERNAL.values()})
    for view_id in VIEW_IDS:
        name = f"3DGS_Table_{view_id:03d}.jpg"
        source_hashes[str(REAL_SOURCE / name)] = sha256(REAL_SOURCE / name)
    hero_name = f"3DGS_Table_{RAW_HERO_ID:03d}.jpg"
    source_hashes[str(RAW_REAL_SOURCE / hero_name)] = sha256(RAW_REAL_SOURCE / hero_name)
    hashes_path.write_text(
        json.dumps(source_hashes, indent=2, sort_keys=True), encoding="utf-8"
    )
    print(json.dumps({"manifest": str(manifest_path), "neural": neural}, indent=2))


if __name__ == "__main__":
    main()
