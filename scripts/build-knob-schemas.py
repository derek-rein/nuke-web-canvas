#!/usr/bin/env python3
"""Regenerate src/nuke/knobSchemas.ts from a local Nuke install.

Set NUKE_APP in the environment or in a gitignored .env file at the repo root.
The output is knob names, defaults, and menus. It never contains filesystem paths.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "nuke" / "knobSchemas.ts"
DUMP = ROOT / "scripts" / "dump_knob_schemas.py"
CATALOG = ROOT / "src" / "nuke" / "catalog.ts"

# Nuke's Python knob.Class() strings, mapped onto DD::Image knob ids.
KIND = {
    "Obsolete_Knob": "obsolete",
    "String_Knob": "string",
    "File_Knob": "file",
    "Filename_Knob": "file",
    "Int_Knob": "int",
    "Enumeration_Knob": "enumeration",
    "Bitmask_Knob": "bitmask",
    "Boolean_Knob": "bool",
    "Disable_Knob": "disable",
    "Double_Knob": "double",
    "Float_Knob": "float",
    "Array_Knob": "array",
    "IArray_Knob": "array",
    "ChannelMask_Knob": "channelMask",
    "Channel_Knob": "channel",
    "XY_Knob": "xy",
    "XYZ_Knob": "xyz",
    "WH_Knob": "wh",
    "BBox_Knob": "bbox",
    "Format_Knob": "format",
    "Color_Knob": "color",
    "AColor_Knob": "acolor",
    "ColorChip_Knob": "colorChip",
    "Tab_Knob": "tab",
    "TabGroup_Knob": "tabGroup",
    "PyScript_Knob": "pyscript",
    "PythonKnob": "python",
    "Python_Knob": "python",
    "PythonCustomKnob": "python",
    "Text_Knob": "text",
    "Help_Knob": "help",
    "Multiline_Eval_String_Knob": "multilineEval",
    "Multiline_String_Knob": "multiline",
    "EvalString_Knob": "string",
    "Script_Knob": "script",
    "Link_Knob": "link",
    "Scale_Knob": "scale",
    "Range_Knob": "range",
    "LookupCurves_Knob": "lookupCurves",
    "LookupCurve_Knob": "lookupCurves",
    "Histogram_Knob": "histogram",
    "Keyer_Knob": "keyer",
    "Eyedropper_Knob": "eyedropper",
    "Transform2d_Knob": "transform2d",
    "Axis_Knob": "axis",
    "UV_Knob": "uv",
    "Box3_Knob": "box3",
    "Password_Knob": "password",
    "Pulldown_Knob": "pulldown",
    "Radio_Knob": "radio",
    "Colorspace_Knob": "colorspace",
    "ColorSpace_Knob": "colorspace",
    "Font_Knob": "freetype",
    "FreeType_Knob": "freetype",
    "OneView_Knob": "oneview",
    "MultiView_Knob": "multiview",
    "ViewView_Knob": "viewview",
    "PyPulldown_Knob": "pypulldown",
    "CascadingEnumeration_Knob": "cascadingEnumeration",
    "EditableEnumeration_Knob": "editableEnumeration",
    "SceneView_Knob": "sceneView",
    "SceneGraph_Knob": "sceneGraph",
    "SceneGraphKnob": "sceneGraph",
    "USDSceneGraph_Knob": "usdSceneGraph",
    "USDSceneGraphKnob": "usdSceneGraph",
    "Table_Knob": "table",
    "GeoSelect_Knob": "geoSelect",
    "Path_Knob": "path",
    "PathExpression_Knob": "pathExpression",
    "MetaData_Knob": "metadata",
    "Metadata_Knob": "metadata",
    "MetaData": "metadata",
    "PixelAspect_Knob": "pixelAspect",
    "List_Knob": "list",
    "Toolbar_Knob": "toolbar",
    "ExoGroup_Knob": "exogroup",
    "Menu_Knob": "menu",
    "Ripple_Knob": "ripple",
    "PositionVector_Knob": "positionVector",
    "Vec2_Knob": "vec2",
    "Vec3_Knob": "vec3",
    "Vec4_Knob": "vec4",
    "SimpleArray_Knob": "simpleArray",
    "ResizableArray_Knob": "resizableArray",
    "FrameExtent_Knob": "frameExtent",
    "FrameExtentKnob": "frameExtent",
    "InputChannel_Knob": "inputChannel",
    "InputChannelMask_Knob": "inputChannelMask",
    "ParticleChannels_Knob": "particleChannels",
    "BlinkEditor_Knob": "blinkEditor",
    "BlinkEditorKnob": "blinkEditor",
    "Gsv_Knob": "gsv",
    "GSV_Knob": "gsv",
    "DynamicBitmask_Knob": "dynamicBitmask",
    "CancelExecution_Knob": "cancelExecution",
    "Icon_Knob": "icon",
    "Toolbox_Knob": "toolbox",
    "Spacer_Knob": "spacer",
    "TextEditor_Knob": "textEditor",
    "MultiArray_Knob": "multiarray",
    "ViewPair_Knob": "viewpair",
    "PluginPython_Knob": "pluginPython",
    "TransformJack_Knob": "transformJack",
    "ControlPointCollection_Knob": "controlPointCollection",
    "ControlPointCollectionKnob": "controlPointCollection",
    "MetaKeyFrame_Knob": "metaKeyFrame",
    "CachedFile_Knob": "cachedFile",
    "Size_Knob": "size",
    "ObsoleteGpuEngine_Knob": "obsoleteGpu",
    "BeginGroup_Knob": "tabGroup",
    "EndGroup_Knob": "tabGroup",
    "WorldMatrix_Knob": "array",
    "Matrix_Knob": "array",
    "TransformGeo_Knob": "array",
    "GeoKnobs_Knob": "custom",
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


def nuke_executable(nuke_app: str) -> Path:
    path = Path(nuke_app).expanduser()
    if path.is_file() and path.suffix != ".app":
        return path
    if path.suffix == ".app":
        macos = path / "Contents" / "MacOS"
        executable = next(macos.glob("Nuke*"), None)
        if executable and executable.is_file():
            return executable
    executable = next(path.glob("Nuke*"), None)
    if executable and executable.is_file():
        return executable
    raise SystemExit("NUKE_APP must point at a Nuke application bundle or its executable.")


def catalog_names() -> list[str]:
    text = CATALOG.read_text(encoding="utf-8")
    found = re.findall(r'^\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s*:', text, re.M)
    names = [quoted or bare for quoted, bare in found]
    if "Blur" not in names or "Merge2" not in names:
        raise SystemExit("Could not read node class names from the catalog.")
    return names


def scrub(text: str) -> str:
    return re.sub(r"/(?:Users|Applications|Volumes)/\S*", "", text)


def convert(payload: dict) -> list[str]:
    unknown = [scrub(item) for item in payload.get("unknown", [])]
    extra_unknown = []
    lines = [
        "// Generated by scripts/build-knob-schemas.py. Do not edit by hand.",
        "// Knob order is node.knob(index), which matches the properties panel.",
        'import type { KnobKind } from "./knobTypes.ts";',
        "",
        "export type KnobRow = [",
        "  string,",
        "  KnobKind,",
        "  string,",
        "  string,",
        "  number,",
        "  string?,",
        "  (number | null)?,",
        "  (number | null)?,",
        "];",
        "",
        "export const KNOB_SCHEMAS: Record<string, KnobRow[]> = {",
    ]
    schemas = payload["schemas"]
    for class_name in sorted(schemas):
        lines.append("  %s: [" % json.dumps(class_name))
        for row in schemas[class_name]:
            name, nuke_class, label, value, start = row[:5]
            if name.endswith("_panelDropped"):
                continue
            menu = row[5] if len(row) > 5 else ""
            lo = row[6] if len(row) > 6 else None
            hi = row[7] if len(row) > 7 else None
            if name == "kernelSource" and "ImageComputationKernel" in value:
                value = ""
            kind = KIND.get(nuke_class)
            if kind is None:
                extra_unknown.append("%s.%s:%s" % (class_name, name, nuke_class))
                kind = "string"
            if kind == "custom":
                kind = "string"
            out = [name, kind, label, value, start]
            if menu or lo is not None:
                out.extend([menu, lo, hi])
            lines.append("    %s," % json.dumps(out, ensure_ascii=True, separators=(",", ":")))
        lines.append("  ],")
    lines.append("};")
    lines.append("")
    failures = [scrub(item) for item in payload.get("failed", [])]
    lines.append("export const KNOB_SCHEMA_FAILURES: readonly string[] = %s;" % json.dumps(failures, indent=2))
    lines.append("")
    unknowns = sorted(set(unknown + extra_unknown))
    lines.append("export const KNOB_SCHEMA_UNKNOWN: readonly string[] = %s;" % json.dumps(unknowns, indent=2))
    lines.append("")
    return lines


def write_schema(payload: dict) -> None:
    text = "\n".join(convert(payload))
    if "/Users/" in text or "/Applications/" in text or "/Volumes/" in text:
        raise SystemExit("Refusing to write a schema that contains a machine path.")
    OUT.write_text(text + "\n", encoding="utf-8")


def main() -> None:
    if "--from-json" in sys.argv:
        source = Path(sys.argv[sys.argv.index("--from-json") + 1])
        write_schema(json.loads(source.read_text(encoding="utf-8")))
        print("wrote %s" % OUT)
        return
    load_dotenv()
    nuke_app = os.environ.get("NUKE_APP", "").strip()
    if not nuke_app:
        raise SystemExit("Set NUKE_APP to regenerate knob schemas.")
    executable = nuke_executable(nuke_app)
    classes = catalog_names()
    temp = Path(os.environ.get("TMPDIR", "/tmp"))
    class_file = temp / "nuke-knob-classes.json"
    out_file = temp / "nuke-knob-schemas.json"
    class_file.write_text(json.dumps(classes), encoding="utf-8")
    env = os.environ.copy()
    env["KNOB_SCHEMA_CLASSES"] = str(class_file)
    env["KNOB_SCHEMA_OUT"] = str(out_file)
    subprocess.check_call(
        [str(executable), "-t", "-q", "--safe", "--nc", str(DUMP)],
        env=env,
    )
    write_schema(json.loads(out_file.read_text(encoding="utf-8")))
    print("wrote %s (%s classes)" % (OUT, len(classes)))


if __name__ == "__main__":
    main()
