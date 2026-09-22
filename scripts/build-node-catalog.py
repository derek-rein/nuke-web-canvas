#!/usr/bin/env python3
"""Regenerate src/nuke/catalog.ts from a local Nuke install.

Set NUKE_APP in the environment or in a gitignored .env file at the repo root.
Colors come from nuke.defaultNodeColor. Shape and mask come from the class
name. The catalog output contains no filesystem paths.
"""

import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "nuke" / "catalog.ts"

BUILTIN_SHAPE = {
    "Viewer": "point",
    "Camera": "circle",
    "Camera2": "circle",
    "Camera3": "circle",
    "Camera4": "circle",
    "Axis": "circle",
    "Axis2": "circle",
    "Axis3": "circle",
    "Axis4": "circle",
    "Light": "circle",
    "Light2": "circle",
    "Light3": "circle",
    "Light4": "circle",
    "Direct": "circle",
    "Spot": "circle",
    "Point": "circle",
    "Environment": "circle",
    "Scene": "circle",
    "Card": "pill",
    "Card2": "pill",
    "Card3D": "pill",
    "Cube": "pill",
    "Sphere": "pill",
    "Cylinder": "pill",
    "ReadGeo": "pill",
    "ReadGeo2": "pill",
    "WriteGeo": "pill",
    "MergeGeo": "pill",
    "TransformGeo": "pill",
    "DisplaceGeo": "pill",
    "BasicMaterial": "point",
    "Phong": "point",
    "Diffuse": "point",
    "Emission": "point",
    "Specular": "point",
    "BlendMat": "point",
    "FillMat": "point",
    "MergeMat": "point",
}

BUILTIN_MASK = {
    "Blur",
    "Convolve",
    "Median",
    "Glow",
    "Sharpen",
    "Emboss",
    "Matrix",
    "Dilate",
    "Erode",
    "Invert",
    "Multiply",
    "Gamma",
    "Add",
    "Saturation",
    "Clamp",
    "ColorCorrect",
    "HueCorrect",
    "HueShift",
    "ColorLookup",
    "ColorMatrix",
    "Grade",
    "Transform",
    "TransformMasked",
    "Crop",
    "Merge",
    "Merge2",
    "Keymix",
    "Dissolve",
    "Shuffle",
    "Shuffle2",
    "Copy",
    "Remove",
    "AddChannels",
    "Premult",
    "Unpremult",
    "Defocus",
    "FilterErode",
    "Inpaint",
    "Inpaint2",
    "Denoise",
    "EdgeDetect",
    "ZDefocus",
    "DirBlur",
    "Soften",
    "GodRays",
    "VectorBlur",
    "MotionBlur",
    "MotionBlur2D",
    "Bilateral",
    "Bilateral2",
    "Keyer",
    "HueKeyer",
    "IBKColour",
    "IBKGizmo",
    "Difference",
    "ChromaKeyer",
    "Primatte",
    "Ultimatte",
    "Keylight",
}


def load_dotenv() -> None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def nuke_layout(nuke_app: str) -> tuple[Path, Path]:
    path = Path(nuke_app).expanduser()
    if path.is_file():
        plugins = path.parent / "plugins"
        if plugins.is_dir():
            return path, plugins
    if path.suffix == ".app":
        macos = path / "Contents" / "MacOS"
        plugins = macos / "plugins"
        executable = next(macos.glob("Nuke*"), None)
        if executable and executable.is_file() and plugins.is_dir():
            return executable, plugins
    plugins = path / "plugins"
    if plugins.is_dir():
        executable = next(path.glob("Nuke*"), None)
        if executable and executable.is_file():
            return executable, plugins
    raise SystemExit("NUKE_APP must point at a Nuke application bundle or its executable.")


def collect_names(plugins: Path) -> list[str]:
    names: set[str] = set()
    for source in plugins.rglob("*"):
        if "icons" in source.parts or source.suffix.lower() not in {".py", ".tcl"}:
            continue
        try:
            text = source.read_text(errors="ignore")
        except OSError:
            continue
        names.update(re.findall(r'createNode(?:Local)?\(\s*["\']([A-Za-z][A-Za-z0-9_]*)["\']', text))
        names.update(re.findall(r'nuke\.createNode\(\s*["\']([A-Za-z][A-Za-z0-9_]*)["\']', text))
        names.update(re.findall(r'toolbar\s+"[^"]+"\s+\S+\s+([A-Za-z][A-Za-z0-9_]*)', text))
    for source in plugins.iterdir():
        if not source.is_file() or source.suffix.lower() not in {".dylib", ".gizmo", ".tcl"}:
            continue
        stem = source.stem
        if stem.lower().endswith(("reader", "writer")) or stem.startswith("_"):
            continue
        if source.suffix.lower() == ".tcl":
            head = source.read_text(errors="ignore")[:180].lstrip()
            if not (head.startswith("load ") or head.startswith("Gizmo") or "addUserKnob" in head):
                continue
        names.add(stem)
    return sorted(name for name in names if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name))


def shape_of(name: str) -> str:
    if name.startswith("Deep"):
        return "deep"
    if name.startswith("Particle"):
        return "particle"
    if name in BUILTIN_SHAPE:
        return BUILTIN_SHAPE[name]
    if name.startswith("Geo"):
        if "Camera" in name or "Light" in name:
            return "circle"
        return "pill"
    return "rect"


def mask_of(name: str, shape: str) -> bool:
    if shape != "rect":
        return False
    return name in BUILTIN_MASK


def nuke_colors(executable: Path, names: list[str]) -> dict[str, str]:
    listed = ",\n".join(repr(name) for name in names)
    script = (
        "import nuke\n"
        f"names = [{listed}]\n"
        "for name in names:\n"
        "    try:\n"
        "        bits = nuke.defaultNodeColor(name) & 0xFFFFFFFF\n"
        "    except Exception:\n"
        "        print(name + '\\tERR')\n"
        "        continue\n"
        "    print(f'{name}\\t{bits:08x}')\n"
    )
    proc = subprocess.run(
        [str(executable), "--nc", "-t", "-q", "--safe", "-"],
        input=script,
        text=True,
        capture_output=True,
        timeout=180,
    )
    colors: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        if "\t" not in line:
            continue
        name, hex_color = line.split("\t", 1)
        if hex_color == "ERR" or len(hex_color) != 8:
            continue
        colors[name] = hex_color[:6]
    if len(colors) < 10:
        raise SystemExit("Nuke did not return node colors. Check that NUKE_APP can run in terminal mode.")
    return colors


def main() -> None:
    load_dotenv()
    nuke_app = os.environ.get("NUKE_APP", "").strip()
    if not nuke_app:
        raise SystemExit("Set NUKE_APP in the environment or in .env. See .env.example.")
    executable, plugins = nuke_layout(nuke_app)
    names = collect_names(plugins)
    colors = nuke_colors(executable, names)
    lines = [
        "import type { NodeShape } from \"./shapes.ts\";",
        "",
        "export type CatalogEntry = { color: string; shape: NodeShape; mask: boolean };",
        "",
        "// Generated by scripts/build-node-catalog.py. Colors are nuke.defaultNodeColor.",
        "export const NODE_CATALOG: Record<string, CatalogEntry> = {",
    ]
    for name in names:
        color = colors.get(name)
        if color is None:
            continue
        shape = shape_of(name)
        mask = mask_of(name, shape)
        lines.append(f"  {name}: {{ color: \"{color}\", shape: \"{shape}\", mask: {str(mask).lower()} }},")
    lines.append("};")
    lines.append("")
    OUT.write_text("\n".join(lines))
    print(f"wrote {len(colors)} classes")


if __name__ == "__main__":
    main()
