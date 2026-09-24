#!/usr/bin/env python3
"""Write public/nst/catalog.json from one pinned toolkit commit.

This is a manual refresh, not a sync. Run it when NST_COMMIT in
src/stories/nst/toolkit.ts changes. GitHub Pages serves the JSON;
the scripts themselves stay on GitHub.
"""

import json
import os
import subprocess
import sys

COMMIT = "b6ebfa3e88fb8cd00d02bd3f5e74b83da2978d9e"
REPO = "CreativeLyons/NukeSurvivalToolkit_publicRelease"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "nst", "catalog.json")


def main() -> None:
    raw = subprocess.check_output(
        [
            "gh",
            "api",
            f"repos/{REPO}/git/trees/{COMMIT}?recursive=1",
            "--jq",
            '[.tree[] | select(.type=="blob") | .path | select(test("\\\\.(nk|gizmo)$"; "i"))]',
        ],
        text=True,
    )
    paths = json.loads(raw)
    files = []
    for path in paths:
        name = path.rsplit("/", 1)[-1]
        stem, ext = name.rsplit(".", 1)
        folder = "gizmos" if "/gizmos/" in path else "nk_files"
        files.append({"path": path, "name": stem, "kind": "gizmo" if ext == "gizmo" else "nk", "folder": folder})
    files.sort(key=lambda item: item["name"].lower())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump({"commit": COMMIT, "repo": REPO, "files": files}, handle, indent=2)
        handle.write("\n")
    print(f"wrote {len(files)} files to {OUT}")


if __name__ == "__main__":
    sys.exit(main())
