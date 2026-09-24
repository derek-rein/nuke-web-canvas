import { expect, test } from "vitest";
import { parseNukeScript } from "./parse.ts";
import { buildProperties } from "./properties.ts";
import { buildScene, expressionScope } from "./scene.ts";
import { renderKnob, renderText, selfScope } from "./tcl.ts";

const here = selfScope({ mix: "0.4", size: "4", operation: "multiply", title: "Plate" });

test("labels substitute value, expr, and if", () => {
  expect(renderText("[value mix]", here)).toBe("0.4");
  expect(renderText("size [expr {[value size] + 1}]", here)).toBe("size 5");
  expect(renderText("[if {[value size] > 1} {return big} {return small}]", here)).toBe("big");
  expect(renderText('[if {[value operation] == "multiply"} {return M} {return other}]', here)).toBe("M");
});

test("python commands stay a placeholder", () => {
  expect(renderText("[python {nuke.thisNode().name()}]", here)).toBe("python");
  expect(renderText("[value size] [python nuke.frame()]", here)).toBe("4 python");
});

test("knob expressions, links, and curves evaluate", () => {
  const scope = selfScope({ size: "{{1+2}}", gain: "{{frame * 2}}" }, 10);
  expect(renderKnob("{{1+2}}", scope)).toBe("3");
  expect(renderKnob("{{frame * 2}}", scope)).toBe("20");
  expect(renderKnob("{{sin(0)}}", scope)).toBe("0");
  expect(renderKnob("{{curve x1 0 x10 10}}", scope)).toBe("10");
  expect(renderKnob("{10 20}", scope)).toBe("{10 20}");
  expect(renderKnob("multiply", scope)).toBe("multiply");
});

test("a link reads another node's knob and a channel", () => {
  const blur = { size: "{10 20}" };
  const scope = selfScope({ size: "{{Blur1.size.w}}" });
  scope.nodes = new Map([
    ["", scope.knobs],
    ["Blur1", blur],
  ]);
  expect(renderKnob("{{Blur1.size}}", scope)).toBe("10 20");
  expect(renderKnob("{{Blur1.size.w}}", scope)).toBe("10");
  expect(renderKnob("{{[python {1}]}}", scope)).toBe("python");
});

test("Nuke 17 quoted TCL and input dimensions evaluate", () => {
  const blur = { size: "{frame*2}" };
  const scope = selfScope({ size: "{frame*2}" }, 10, "Grade1", 1920, 1080);
  scope.nodes = new Map([
    ["Grade1", scope.knobs],
    ["Blur1", blur],
  ]);
  expect(renderKnob("{frame*2}", scope)).toBe("20");
  expect(renderKnob("{Blur1.size+1}", scope)).toBe("21");
  expect(renderKnob('{{"\\[value input.width 0]/2"} {"\\[value input.height 0]/2"}}', scope)).toBe("960 540");
  expect(renderText("[value Blur1.size]", scope)).toBe("20");
  expect(renderText("[value Blur1.size 12]", scope)).toBe("20");
  expect(renderText("[knob Blur1.size]", scope)).toBe("{frame*2}");
  const parent = selfScope({ name: "Group1" }, 10, "Group1");
  const inner = selfScope({}, 10, "Inner1");
  inner.parent = parent;
  expect(renderText("[value parent.name]", inner)).toBe("Group1");
});

test("the graph shows evaluated labels and property values", () => {
  const scene = buildScene(
    parseNukeScript(`
Root {
 first_frame 10
 format "1920 1080 0 0 1920 1080 1 HD_1080"
}
Blur {
 inputs 0
 name Blur1
 size {{frame}}
 label {[expr {[value size] + 1}]}
 xpos 0
 ypos 0
}
NoOp {
 inputs 0
 name NoOp1
 label "blur [value Blur1.size] [python {nuke.thisNode().name()}]"
 xpos 0
 ypos 40
}
`),
    () => 40,
  );
  const blur = scene.nodes.find((node) => node.name === "Blur1");
  const noop = scene.nodes.find((node) => node.name === "NoOp1");
  expect(scene.width).toBe(1920);
  expect(scene.height).toBe(1080);
  expect(blur?.labelLines).toContain("11");
  expect(noop?.labelLines).toEqual(["NoOp1", "blur 10 python"]);
  expect(blur).toBeTruthy();
  const panel = buildProperties(blur!, expressionScope(blur!, scene));
  const size = panel.tabs.flatMap((tab) => tab.controls).find((control) => control.name === "size");
  expect(size?.value).toBe("10");
  expect(size?.tooltip).toContain("frame");
});
