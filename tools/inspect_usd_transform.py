#!/usr/bin/env python3
"""Inspect the copied Neuralangelo USD and emit its internal mesh transform."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pxr import Usd, UsdGeom


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: inspect_usd_transform.py COPIED_USD")
    usd_path = Path(sys.argv[1]).resolve()
    root = Path(__file__).resolve().parents[1]
    if root not in usd_path.parents:
        raise SystemExit("Refusing to inspect a USD outside presentation")
    stage = Usd.Stage.Open(str(usd_path))
    if stage is None:
        raise SystemExit(f"Unable to open {usd_path}")
    target = stage.GetPrimAtPath("/World/black_table_2048/mesh")
    if not target.IsValid():
        meshes = [prim for prim in stage.Traverse() if prim.IsA(UsdGeom.Mesh)]
        if len(meshes) != 1:
            raise SystemExit(f"Expected one mesh, found {[str(p.GetPath()) for p in meshes]}")
        target = meshes[0]
    cache = UsdGeom.XformCache(Usd.TimeCode.Default())
    matrix = cache.GetLocalToWorldTransform(target)
    rows = [[float(matrix[row][col]) for col in range(4)] for row in range(4)]
    payload = {
        "sourceCopy": str(usd_path),
        "meshPath": str(target.GetPath()),
        "stageUpAxis": str(UsdGeom.GetStageUpAxis(stage)),
        "metersPerUnit": float(UsdGeom.GetStageMetersPerUnit(stage)),
        "meshLocalToStage": rows,
    }
    output = root / ".tmp" / "usd_internal_transform.json"
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
