#!/usr/bin/env python3
"""Verify source assets and repository files outside presentation are unchanged."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    hashes_path = ROOT / ".source-hashes.json"
    if not hashes_path.is_file():
        raise SystemExit("Missing .source-hashes.json; run prepare-assets first")
    expected = json.loads(hashes_path.read_text(encoding="utf-8"))
    mismatches = []
    for name, digest in expected.items():
        path = Path(name)
        actual = sha256(path) if path.is_file() else "MISSING"
        if actual != digest:
            mismatches.append({"path": name, "expected": digest, "actual": actual})
    if mismatches:
        raise SystemExit("Source asset mismatch:\n" + json.dumps(mismatches, indent=2))

    current = subprocess.run(
        ["git", "status", "--short", "--", ".", ":!presentation"],
        cwd=ROOT.parent,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    baseline = (ROOT / ".outside-status.before.txt").read_text(encoding="utf-8")
    if current != baseline:
        raise SystemExit(
            "Repository state outside presentation changed:\n"
            f"--- baseline ---\n{baseline}--- current ---\n{current}"
        )
    print(f"Verified {len(expected)} immutable source files and unchanged outside Git state.")


if __name__ == "__main__":
    main()
