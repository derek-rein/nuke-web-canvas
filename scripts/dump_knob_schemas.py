"""Nuke-side dump of every node's visible property knobs.

Invoked by scripts/build-knob-schemas.py. Reads KNOB_SCHEMA_CLASSES and writes
KNOB_SCHEMA_OUT. No filesystem paths are stored in the knob values.
"""

import json
import math
import os
import re
import sys

import nuke

NUMERIC = {
    "Array_Knob",
    "WH_Knob",
    "XY_Knob",
    "XYZ_Knob",
    "BBox_Knob",
    "UV_Knob",
    "Scale_Knob",
    "Range_Knob",
    "Double_Knob",
    "Float_Knob",
    "Int_Knob",
    "Vec2_Knob",
    "Vec3_Knob",
    "Vec4_Knob",
    "Box3_Knob",
    "PixelAspect_Knob",
    "SimpleArray_Knob",
    "ResizableArray_Knob",
    "PositionVector_Knob",
    "Size_Knob",
}

MENUISH = ("Enum", "Bitmask", "Pulldown", "Radio", "Format", "ColorSpace", "Colorspace", "View", "Menu")

PATH_RE = re.compile(r"/(?:Users|Applications|Volumes)/\S*")


def clean(text):
    text = str(text).replace("\r\n", "\n").replace("\r", "\n")
    if "/Users/" in text or "/Applications/" in text or "/Volumes/" in text:
        text = PATH_RE.sub("", text)
    return text


def first_number(text):
    match = re.search(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", text.replace("{", " ").replace("}", " "))
    if not match:
        return None
    try:
        value = float(match.group(0))
    except ValueError:
        return None
    if not math.isfinite(value):
        return None
    return value


def rounded(value):
    number = round(float(value), 6)
    if number == int(number) and abs(number) < 1e15:
        return int(number)
    return number


def slider_ends(knob, value):
    if knob.Class() not in NUMERIC:
        return None, None
    try:
        lo = float(knob.min())
        hi = float(knob.max())
    except Exception:
        return None, None
    if not (math.isfinite(lo) and math.isfinite(hi) and hi > lo):
        return None, None
    if hi > 1e6 or lo < -1e6:
        return None, None
    default = first_number(value)
    # An unset slider reports its max as the current number once that number exceeds 1.
    if default is not None and abs(hi - default) < 1e-6 and hi > 1.0001:
        return None, None
    return rounded(lo), rounded(hi)


def menu_text(knob):
    if not any(token in knob.Class() for token in MENUISH):
        return ""
    if not hasattr(knob, "values"):
        return ""
    try:
        values = list(knob.values())
    except Exception:
        return ""
    parts = []
    for raw in values[:400]:
        bits = [bit for bit in str(raw).split("\t") if bit]
        if not bits:
            continue
        token = bits[0]
        label = bits[-1]
        parts.append(token if label == token else "%s\t%s" % (token, label))
    return "\n".join(parts)


# Not shown in the properties panel. The Node tab itself is a real Tab_Knob and
# stays in allKnobs() order.
SKIP = {
    "name",
    "help",
    "onCreate",
    "onDestroy",
    "knobChanged",
    "updateUI",
    "autolabel",
    "panel",
    "selected",
    "xpos",
    "ypos",
    "icon",
    "indicators",
    "rootNodeUpdated",
    "gl_color",
}


def collect(node, class_name, unknown):
    # allKnobs() / knob(index) is the properties-panel order. knobs() is a dict
    # and drops unnamed labels and tab markers.
    rows = []
    seen = set()
    # allKnobs() is the panel order. knob(index) follows a link to its target
    # and would record that target too early, then skip it on its own tab.
    for index, knob in enumerate(node.allKnobs()):
        try:
            name = knob.name()
            knob_class = knob.Class()
            label = clean(knob.label()).strip()
        except Exception as exc:
            unknown.append("%s.#%s:ERR %s" % (class_name, index, exc))
            continue
        identity = id(knob)
        if identity in seen:
            continue
        seen.add(identity)
        if knob_class == "Obsolete_Knob" or knob.getFlag(nuke.INVISIBLE) or not knob.visible():
            continue
        if label == "INVISIBLE" or name in SKIP or name.endswith("_panelDropped"):
            continue
        # Unnamed tabs close a group. They are not pages in the panel.
        if knob_class == "Tab_Knob" and not label:
            continue
        if not name:
            name = "panel_%d" % index
        try:
            value = clean(knob.toScript())
            if name == "kernelSource" and "ImageComputationKernel" in value:
                value = ""
            menu = menu_text(knob)
            lo, hi = slider_ends(knob, value)
            start = 1 if knob.getFlag(nuke.STARTLINE) else 0
        except Exception as exc:
            unknown.append("%s.%s:ERR %s" % (class_name, name, exc))
            continue
        row = [name, knob_class, label, value, start]
        if menu or lo is not None:
            row.extend([menu, lo, hi])
        rows.append(row)
    return rows


def main():
    out_path = os.environ["KNOB_SCHEMA_OUT"]
    classes = json.loads(open(os.environ["KNOB_SCHEMA_CLASSES"], encoding="utf-8").read())
    schemas = {}
    failed = []
    unknown = []
    for index, class_name in enumerate(classes, 1):
        nuke.scriptClear()
        node = None
        try:
            node = nuke.createNode(class_name, inpanel=False)
        except Exception as exc:
            failed.append("%s: %s" % (class_name, exc))
            node = None
        if node is None:
            if not failed or not failed[-1].startswith(class_name + ":"):
                failed.append("%s: createNode returned nothing" % class_name)
        else:
            try:
                schemas[class_name] = collect(node, class_name, unknown)
            except Exception as exc:
                failed.append("%s: %s" % (class_name, exc))
        if index % 40 == 0:
            sys.stderr.write("knobs %s/%s\n" % (index, len(classes)))
            sys.stderr.flush()
            partial = out_path + ".partial"
            with open(partial, "w", encoding="utf-8") as handle:
                json.dump({"schemas": schemas, "failed": failed, "unknown": unknown}, handle)
    nuke.scriptClear()
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump({"schemas": schemas, "failed": failed, "unknown": unknown}, handle)
    sys.stderr.write("knobs done %s classes, %s failed, %s unknown\n" % (len(schemas), len(failed), len(unknown)))


if __name__ == "__main__":
    main()
