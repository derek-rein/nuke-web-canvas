import { expect, test } from "vitest";
import { KNOB_KINDS } from "./knobTypes.ts";
import { parseNukeScript } from "./parse.ts";
import {
  buildProperties,
  curvePoints,
  sliderFraction,
  type PropertyPanel,
} from "./properties.ts";
import { buildScene } from "./scene.ts";
import { KNOB_SCHEMA_FAILURES, KNOB_SCHEMA_UNKNOWN, KNOB_SCHEMAS } from "./knobSchemas.ts";

function panelFor(source: string, name: string): PropertyPanel {
  const scene = buildScene(parseNukeScript(source), () => 40);
  const node = scene.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`missing ${name}`);
  return buildProperties(node);
}

function control(panel: PropertyPanel, tab: string, name: string) {
  const found = panel.tabs.find((item) => item.name === tab)?.controls.find((item) => item.name === name);
  if (!found) throw new Error(`missing ${tab}.${name}`);
  return found;
}

test("knob schemas cover the comp nodes and stay free of machine paths", () => {
  expect(Object.keys(KNOB_SCHEMAS).length).toBeGreaterThan(500);
  for (const name of ["Blur", "Merge2", "Grade", "Read", "Transform", "Constant", "Group", "Viewer", "Camera3", "ColorLookup", "Shuffle2", "Keymix", "Dot", "StickyNote", "BackdropNode"]) {
    expect(KNOB_SCHEMAS[name], name).toBeDefined();
  }
  for (const rows of Object.values(KNOB_SCHEMAS)) {
    for (const row of rows) expect(KNOB_KINDS).toContain(row[1]);
  }
  const unknownClasses = new Set(KNOB_SCHEMA_UNKNOWN.map((item) => item.slice(item.lastIndexOf(":") + 1)));
  expect(unknownClasses.has("IArray_Knob")).toBe(false);
  expect(unknownClasses.has("FrameExtentKnob")).toBe(false);
  expect(unknownClasses.has("BlinkEditorKnob")).toBe(false);
  expect(unknownClasses.has("ControlPointCollection_Knob")).toBe(false);
  const text = JSON.stringify({ KNOB_SCHEMAS, KNOB_SCHEMA_FAILURES });
  expect(text).not.toContain("/Users/");
  expect(text).not.toContain("/Applications/");
  expect(text).not.toContain("/Volumes/");
});

test("a default Blur panel matches Nuke", () => {
  const panel = panelFor("Blur {\n inputs 0\n name Blur1\n}\n", "Blur1");
  expect(panel.tabs.map((tab) => tab.name)).toEqual(["Blur", "Node"]);
  expect(control(panel, "Blur", "channels").value).toBe("all");
  expect(control(panel, "Blur", "channels").channels).toEqual({ r: true, g: true, b: true, a: true });
  expect(control(panel, "Blur", "size")).toMatchObject({ value: "0", min: 0, max: 100, startLine: true });
  expect(control(panel, "Blur", "filter").options).toEqual(["box", "triangle", "quadratic", "gaussian"]);
  expect(control(panel, "Blur", "filter").value).toBe("gaussian");
  expect(control(panel, "Blur", "quality")).toMatchObject({ value: "15", min: null, max: null, startLine: false });
  expect(control(panel, "Blur", "crop").checked).toBe(true);
  expect(control(panel, "Blur", "maskChannelMask").startLine).toBe(true);
  expect(control(panel, "Blur", "maskChannelInput")).toMatchObject({ label: "mask", value: "none", startLine: false });
  expect(control(panel, "Blur", "mix")).toMatchObject({ value: "1", min: 0, max: 1 });
  expect(control(panel, "Node", "hide_input").checked).toBe(false);
  expect(panel.tabs.flatMap((tab) => tab.controls).some((item) => item.name.endsWith("_panelDropped"))).toBe(false);
});

test("script values and a custom tab sit on top of the builtin panel", () => {
  const panel = panelFor(
    `Blur {
 inputs 0
 name Blur1
 size 4
 hide_input true
 addUserKnob {7 gain l "Gain" t "brighten" R 0 2}
 addUserKnob {4 mode l Mode M {soft hard}}
 addUserKnob {1 secret l Secret +HIDDEN}
 gain 1.5
 mode hard
 secret nope
}
`,
    "Blur1",
  );
  expect(control(panel, "Blur", "size").value).toBe("4");
  expect(control(panel, "Blur", "channels").value).toBe("all");
  expect(control(panel, "Node", "hide_input").checked).toBe(true);
  expect(panel.tabs.map((tab) => tab.name)).toEqual(["Blur", "User", "Node"]);
  expect(control(panel, "User", "gain")).toMatchObject({ label: "Gain", value: "1.5", min: 0, max: 2, tooltip: "brighten" });
  expect(control(panel, "User", "mode")).toMatchObject({ value: "hard", options: ["soft", "hard"] });
  expect(panel.tabs.flatMap((tab) => tab.controls).some((item) => item.name === "secret")).toBe(false);
});

test("Merge uses Nuke's operation list, labels, and row breaks", () => {
  const panel = panelFor("Merge2 {\n inputs 2\n name Merge1\n}\n", "Merge1");
  const operation = control(panel, "Merge", "operation");
  expect(operation.value).toBe("over");
  expect(operation.options).toContain("over");
  expect(operation.optionLabels[operation.options.indexOf("hypot")]).toBe("diagonal");
  expect(control(panel, "Merge", "screen_alpha")).toMatchObject({ label: "alpha masking", checked: false, startLine: false });
  expect(control(panel, "Merge", "metainput").startLine).toBe(false);
  expect(control(panel, "Merge", "Achannels").value).toBe("rgba");
  expect(control(panel, "Merge", "mix").value).toBe("1");
});

test("a camera matrix is numeric and time nodes keep their frame range", () => {
  const camera = panelFor("Camera3 {\n inputs 0\n name Camera1\n}\n", "Camera1");
  const matrix = camera.tabs.flatMap((tab) => tab.controls).find((item) => item.name === "matrix");
  const focal = camera.tabs.flatMap((tab) => tab.controls).find((item) => item.name === "focal");
  expect(matrix?.kind).toBe("array");
  expect(focal).toMatchObject({ kind: "array", value: "50", min: 5, max: 100 });
  const retime = panelFor("TimeOffset {\n inputs 0\n name TimeOffset1\n}\n", "TimeOffset1");
  expect(retime.tabs.flatMap((tab) => tab.controls).find((item) => item.name === "time")?.kind).toBe("frameExtent");
});

test("a group keeps its own knobs and puts author knobs on their tab", () => {
  const panel = panelFor(
    `Group {
 name grade_group
 addUserKnob {20 Grade}
 addUserKnob {7 gamma l gamma}
 gamma 0.8
}
end_group
`,
    "grade_group",
  );
  expect(control(panel, "Group", "export_as_gizmo").label).toContain("gizmo");
  expect(control(panel, "Grade", "gamma").value).toBe("0.8");
});

test("slider fractions stay inside the track", () => {
  expect(sliderFraction(0, 0, 100)).toBe(0);
  expect(sliderFraction(100, 0, 100)).toBe(1);
  expect(sliderFraction(0.5, 0, 1)).toBeCloseTo(0.5);
  expect(sliderFraction(1, 0, 100)).toBeGreaterThan(0);
  expect(sliderFraction(1, 0, 100)).toBeLessThan(sliderFraction(10, 0, 100));
  expect(curvePoints("curve L 0 0 1 1")).toEqual([
    [0, 0],
    [1, 1],
  ]);
});
