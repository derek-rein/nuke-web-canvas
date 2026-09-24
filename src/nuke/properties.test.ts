import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PropertiesPane } from "../PropertiesPane.tsx";
import { KNOB_KINDS } from "./knobTypes.ts";
import { parseNukeScript } from "./parse.ts";
import {
  axisLabels,
  buildProperties,
  chipColor,
  curvePoints,
  gangsUniform,
  matrixRows,
  showsSlider,
  sliderFraction,
  type PropertyPanel,
} from "./properties.ts";
import { expressionScope } from "./scene.ts";
import { buildScene } from "./scene.ts";
import { KNOB_SCHEMA_FAILURES, KNOB_SCHEMA_UNKNOWN, KNOB_SCHEMAS } from "./knobSchemas.ts";

function panelFor(source: string, name: string): PropertyPanel {
  const scene = buildScene(parseNukeScript(source), () => 40);
  const node = scene.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`missing ${name}`);
  return buildProperties(node, expressionScope(node, scene));
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
  const blurNames = panel.tabs.find((tab) => tab.name === "Blur")?.controls.map((control) => control.name) ?? [];
  expect(blurNames.slice(0, 5)).toEqual(["channels", "size", "filter", "quality", "crop"]);
  expect(blurNames.indexOf("mix")).toBeGreaterThan(blurNames.indexOf("crop"));
  expect(panel.tabs.find((tab) => tab.name === "Blur")?.controls.some((control) => control.label === "mask")).toBe(true);
  expect(control(panel, "Blur", "maskChannelInput")).toMatchObject({ label: "", value: "none", startLine: false });
  const nodeNames = panel.tabs.find((tab) => tab.name === "Node")?.controls.map((control) => control.name) ?? [];
  expect(nodeNames[0]).toBe("label");
  expect(nodeNames.indexOf("hide_input")).toBeGreaterThan(nodeNames.indexOf("note_font"));
  expect(nodeNames.indexOf("postage_stamp")).toBeGreaterThan(nodeNames.indexOf("hide_input"));
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
  expect(control(panel, "Node", "export_as_gizmo").label).toContain("gizmo");
  expect(control(panel, "Grade", "gamma").value).toBe("0.8");
});

test("a transform center evaluates Nuke 17 input TCL", () => {
  const panel = panelFor(
    `Root {
 format "1920 1080 0 0 1920 1080 1 HD_1080"
}
Transform {
 inputs 0
 name Transform1
 center {{"\\[value input.width 0]/2"} {"\\[value input.height 0]/2"}}
}
`,
    "Transform1",
  );
  expect(control(panel, "Transform", "center").value).toBe("960 540");
  expect(control(panel, "Transform", "center").kind).toBe("xy");
  const html = renderToStaticMarkup(createElement(PropertiesPane, { panel }));
  expect(html).toContain(">x<");
  expect(html).toContain('value="960"');
  expect(html).toContain(">y<");
  expect(html).toContain('value="540"');
  expect(html).toContain('class="nk-slider"');
  const read = panelFor("Read {\n inputs 0\n name Read1\n file /plates/shot.exr\n}\n", "Read1");
  const readHtml = renderToStaticMarkup(createElement(PropertiesPane, { panel: read }));
  expect(readHtml).toContain('value="/plates/shot.exr"');
  expect(readHtml).toContain('aria-label="Browse"');
  expect(readHtml).toContain(">Frame Range<");
  expect(readHtml).not.toContain('class="nk-slider"');
});

test("knob widgets follow Nuke 17 control shapes", () => {
  expect(axisLabels("xy")).toEqual(["x", "y"]);
  expect(axisLabels("uv")).toEqual(["u", "v"]);
  expect(axisLabels("bbox")).toEqual(["x", "y", "r", "t"]);
  expect(axisLabels("box3")).toEqual(["x", "y", "n", "r", "t", "f"]);
  expect(axisLabels("int")).toBeNull();
  expect(gangsUniform("color")).toBe(true);
  expect(gangsUniform("xy")).toBe(false);
  expect(showsSlider("float")).toBe(true);
  expect(showsSlider("int")).toBe(false);
  expect(matrixRows("{ { 0 1 2 } { 3 4 5 } }")).toEqual([
    ["0", "1", "2"],
    ["3", "4", "5"],
  ]);
  expect(chipColor("4278190080")).toBe("#ff0000");
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
