import { expect, test } from "vitest";
import { parseTileColor } from "./colors.ts";
import { parseNukeScript } from "./parse.ts";
import { buildScene, pipeSamples, type DagNode } from "./scene.ts";

const measure = (line: string) => line.length * 6;

function sceneOf(source: string) {
  return buildScene(parseNukeScript(source), measure);
}

function nodeNamed(nodes: DagNode[], name: string): DagNode {
  const found = nodes.find((node) => node.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

test("a single-line grade keeps the minimum body and its script position", () => {
  const grade = nodeNamed(
    sceneOf(`
Grade {
 name Grade1
 xpos 10
 ypos 20
 inputs 0
}
`).nodes,
    "Grade1",
  );
  expect(grade.w).toBe(80);
  expect(grade.h).toBe(18);
  expect(grade.bodyH).toBe(18);
  expect(grade.bodyY).toBe(grade.y);
  expect(grade.x).toBe(10);
  expect(grade.y).toBe(20);
});

test("extra label lines grow the body and a long line grows the width", () => {
  const grade = nodeNamed(
    sceneOf(`
Grade {
 name Grade1
 label "abcdefghijkl\\nsecond"
 xpos 0
 ypos 0
 inputs 0
}
`).nodes,
    "Grade1",
  );
  expect(grade.labelLines).toEqual(["Grade1", "abcdefghijkl", "second"]);
  expect(grade.bodyH).toBe(18 + 24);
  expect(grade.w).toBe(Math.ceil(12 * 6 + 16));
  expect(grade.w).toBeGreaterThan(80);
});

test("dots are 12 by 12 and anchors meet at the center", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Constant1
 xpos 0
 ypos 0
}
Dot {
 name Dot1
 xpos 34
 ypos 40
}
Grade {
 name Grade1
 xpos 0
 ypos 80
}
`);
  const dot = nodeNamed(scene.nodes, "Dot1");
  expect(dot.w).toBe(12);
  expect(dot.h).toBe(12);
  const into = scene.pipes.find((pipe) => pipe.toId === dot.id);
  const out = scene.pipes.find((pipe) => pipe.fromId === dot.id);
  expect(into?.to).toEqual({ x: 40, y: 46, side: "center" });
  expect(out?.from).toEqual({ x: 40, y: 46, side: "center" });
});

test("a group labels its only input 1", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Constant1
 xpos 0
 ypos 0
}
Group {
 name Group1
 xpos 0
 ypos 80
}
`);
  const group = nodeNamed(scene.nodes, "Group1");
  const pipe = scene.pipes.find((item) => item.toId === group.id);
  expect(group.shape).toBe("point");
  expect(pipe?.label).toBe("1");
});

test("viewer inputs are numbered and input and output are trapezoids", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name A
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name B
 xpos 120
 ypos 0
}
Viewer {
 inputs 2
 name Viewer1
 xpos 40
 ypos 80
}
Input {
 inputs 0
 name Input1
 xpos 0
 ypos 160
}
Output {
 name Output1
 xpos 0
 ypos 220
}
`);
  const viewer = nodeNamed(scene.nodes, "Viewer1");
  const labels = scene.pipes
    .filter((pipe) => pipe.toId === viewer.id)
    .sort((a, b) => a.inputIndex - b.inputIndex)
    .map((pipe) => pipe.label);
  expect(labels).toEqual(["1", "2"]);
  expect(nodeNamed(scene.nodes, "Input1").shape).toBe("input");
  expect(nodeNamed(scene.nodes, "Output1").shape).toBe("output");
});

test("merge input 0 is the right-hand B pipe", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name A
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name B
 xpos 120
 ypos 0
}
Merge2 {
 inputs 2
 name Merge1
 xpos 40
 ypos 80
}
`);
  const merge = nodeNamed(scene.nodes, "Merge1");
  const pipes = scene.pipes.filter((pipe) => pipe.toId === merge.id).sort((a, b) => a.inputIndex - b.inputIndex);
  expect(pipes).toHaveLength(2);
  expect(pipes[0]?.label).toBe("B");
  expect(pipes[1]?.label).toBe("A");
  expect(pipes.some((pipe) => pipe.label === "mask")).toBe(false);
  expect(pipes[0]!.to.x).toBeGreaterThan(pipes[1]!.to.x);
  expect(pipes[0]?.to.side).toBe("top");
  expect(pipes[1]?.to.side).toBe("top");
  expect(pipes[0]?.to.y).toBe(merge.bodyY);
});

test("a single input is centered and unlabeled", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Constant1
 xpos 0
 ypos 0
}
Grade {
 name Grade1
 xpos 0
 ypos 40
}
`);
  const grade = nodeNamed(scene.nodes, "Grade1");
  const pipe = scene.pipes.find((item) => item.toId === grade.id);
  expect(pipe?.label).toBe("");
  expect(pipe?.to).toEqual({ x: grade.x + grade.w / 2, y: grade.bodyY, side: "top" });
});

test("the mask input sits on the right edge", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name C0
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name C1
 xpos 100
 ypos 0
}
Constant {
 inputs 0
 name C2
 xpos 200
 ypos 0
}
Merge2 {
 inputs 2+1
 name Merge1
 xpos 80
 ypos 80
}
`);
  const merge = nodeNamed(scene.nodes, "Merge1");
  const mask = scene.pipes.find((pipe) => pipe.toId === merge.id && pipe.inputIndex === 2);
  expect(mask?.label).toBe("mask");
  expect(mask?.to.side).toBe("right");
  expect(mask?.to.x).toBe(merge.x + merge.w);
});

test("a merge with extra inputs labels them B, A1, A2", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name C0
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name C1
 xpos 80
 ypos 0
}
Constant {
 inputs 0
 name C2
 xpos 160
 ypos 0
}
Constant {
 inputs 0
 name C3
 xpos 240
 ypos 0
}
Merge2 {
 inputs 3+1
 name Merge1
 xpos 80
 ypos 80
}
`);
  const merge = nodeNamed(scene.nodes, "Merge1");
  const labels = scene.pipes
    .filter((pipe) => pipe.toId === merge.id)
    .sort((a, b) => a.inputIndex - b.inputIndex)
    .map((pipe) => pipe.label);
  expect(labels).toEqual(["B", "A1", "A2", "mask"]);
});

test("one image input stays blank and a connected mask says mask", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name C0
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name C1
 xpos 100
 ypos 0
}
Grade {
 inputs 1+1
 name Grade1
 xpos 40
 ypos 80
}
`);
  const grade = nodeNamed(scene.nodes, "Grade1");
  const labels = scene.pipes
    .filter((pipe) => pipe.toId === grade.id)
    .sort((a, b) => a.inputIndex - b.inputIndex)
    .map((pipe) => pipe.label);
  expect(labels).toEqual(["", "mask"]);
});

test("contact sheet arrows are numbered even when only two are connected", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name C0
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name C1
 xpos 80
 ypos 0
}
ContactSheet {
 inputs 2
 name Sheet1
 xpos 20
 ypos 80
}
`);
  const sheet = nodeNamed(scene.nodes, "Sheet1");
  const labels = scene.pipes
    .filter((pipe) => pipe.toId === sheet.id)
    .sort((a, b) => a.inputIndex - b.inputIndex)
    .map((pipe) => pipe.label);
  expect(labels).toEqual(["1", "2"]);
});

test("scanline render names its inputs instead of numbering them", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name C0
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name C1
 xpos 80
 ypos 0
}
Constant {
 inputs 0
 name C2
 xpos 160
 ypos 0
}
ScanlineRender {
 inputs 3
 name Render1
 xpos 40
 ypos 80
}
`);
  const render = nodeNamed(scene.nodes, "Render1");
  const labels = scene.pipes
    .filter((pipe) => pipe.toId === render.id)
    .sort((a, b) => a.inputIndex - b.inputIndex)
    .map((pipe) => pipe.label);
  expect(labels).toEqual(["bg", "obj/scn", "cam"]);
});

test("pills and deep nodes use the same bar width as a 2D node", () => {
  const scene = sceneOf(`
Blur {
 inputs 0
 name NodeA
 xpos 0
 ypos 0
}
DeepRead {
 inputs 0
 name NodeB
 xpos 0
 ypos 40
}
GeoCard {
 inputs 0
 name NodeC
 xpos 0
 ypos 80
}
`);
  const width = (name: string) => nodeNamed(scene.nodes, name).w;
  expect(width("NodeB")).toBe(width("NodeA"));
  expect(width("NodeC")).toBe(width("NodeA"));
  expect(nodeNamed(scene.nodes, "NodeA").bodyH).toBe(18);
});

test("tile colors override class defaults", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Hex
 tile_color 0xff0000ff
 xpos 0
 ypos 0
}
Constant {
 inputs 0
 name Decimal
 tile_color 4278190335
 xpos 100
 ypos 0
}
Blur {
 inputs 0
 name Blur1
 xpos 0
 ypos 40
}
`);
  expect(nodeNamed(scene.nodes, "Hex").color).toEqual([1, 0, 0, 1]);
  expect(nodeNamed(scene.nodes, "Decimal").color).toEqual([1, 0, 0, 1]);
  expect(parseTileColor("4278190335")).toEqual([1, 0, 0, 1]);
  const blur = nodeNamed(scene.nodes, "Blur1").color;
  expect(blur[0]).toBeCloseTo(0xcc / 255);
  expect(blur[1]).toBeCloseTo(0x80 / 255);
  expect(blur[2]).toBeCloseTo(0x4e / 255);
  expect(blur[3]).toBe(1);
});

test("dots inherit color through other dots", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Red
 tile_color 0xff0000ff
 xpos 0
 ypos 0
}
Dot {
 name Dot1
 xpos 34
 ypos 30
}
Dot {
 name Dot2
 xpos 34
 ypos 60
}
`);
  expect(nodeNamed(scene.nodes, "Dot1").color).toEqual([1, 0, 0, 1]);
  expect(nodeNamed(scene.nodes, "Dot2").color).toEqual([1, 0, 0, 1]);
});

test("read and merge autolabels keep the node name first", () => {
  const scene = sceneOf(`
Read {
 inputs 0
 name Read1
 file /plates/hero.1001.exr
 xpos 0
 ypos 0
}
Merge2 {
 inputs 0
 name Merge1
 operation multiply
 xpos 0
 ypos 40
}
`);
  expect(nodeNamed(scene.nodes, "Read1").labelLines).toEqual(["Read1", "hero.1001.exr"]);
  expect(nodeNamed(scene.nodes, "Merge1").labelLines).toEqual(["Merge1 (multiply)"]);
});

test("groups, dots, and backdrops follow Nuke's label rules", () => {
  const scene = sceneOf(`
Group {
 name grade_group
 label {[value mix]}
 mix 0.4
 xpos 0
 ypos 0
}
end_group
Dot {
 name Dot1
 label corner
 xpos 0
 ypos 40
}
BackdropNode {
 name BackdropNode1
 label {[value title]}
 title Plate
 note_font_color 0xff0000ff
 xpos 0
 ypos 80
 bdwidth 100
 bdheight 40
}
FrameHold {
 inputs 0
 name FrameHold1
 first_frame 1080
 xpos 0
 ypos 140
}
Blur {
 inputs 0
 name Blur1
 channels alpha
 xpos 0
 ypos 180
}
`);
  expect(nodeNamed(scene.nodes, "grade_group").labelLines).toEqual(["grade_group", "0.4"]);
  expect(nodeNamed(scene.nodes, "Dot1").labelLines).toEqual(["corner"]);
  expect(nodeNamed(scene.nodes, "BackdropNode1").labelLines).toEqual(["Plate"]);
  expect(nodeNamed(scene.nodes, "BackdropNode1").textColor).toEqual([1, 0, 0, 1]);
  expect(nodeNamed(scene.nodes, "FrameHold1").labelLines).toEqual(["FrameHold1", "(frame 1080)"]);
  expect(nodeNamed(scene.nodes, "Blur1").labelLines).toEqual(["Blur1", "(alpha)"]);
});

test("disable, hide input, and postage stamps change the body", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Constant1
 xpos 0
 ypos 0
}
Grade {
 name Grade1
 xpos 0
 ypos 20
 disable true
 hide_input true
 postage_stamp true
}
Grade {
 name Grade2
 xpos 100
 ypos 20
 postage_stamp true
}
`);
  const grade = nodeNamed(scene.nodes, "Grade1");
  expect(grade.disabled).toBe(true);
  expect(grade.hideInput).toBe(true);
  expect(grade.postage).toBe(true);
  expect(grade.bodyY).toBe(grade.y + 46);
  expect(grade.bodyH).toBe(18);
  expect(grade.h).toBe(64);
  expect(scene.pipes.some((pipe) => pipe.toId === grade.id)).toBe(false);
  const stamped = nodeNamed(scene.nodes, "Grade2");
  const pipe = scene.pipes.find((item) => item.toId === stamped.id);
  expect(pipe?.to.y).toBe(stamped.bodyY);
  expect(pipe?.to.y).not.toBe(stamped.y);
});

test("sticky notes grow with note_font_size so the text fits", () => {
  const sceneFor = (font: string) =>
    sceneOf(`
StickyNote {
 inputs 0
 name StickyNote1
 label "hero over bg\\nmask from roto"
 ${font}
 xpos 0
 ypos 0
}
`);
  const small = nodeNamed(sceneFor("note_font_size 10").nodes, "StickyNote1");
  const big = nodeNamed(sceneFor("note_font_size 30").nodes, "StickyNote1");
  expect(big.h).toBeGreaterThan(small.h);
  expect(big.w).toBeGreaterThan(small.w);
  const fitted = nodeNamed(sceneFor("note_font_size 14").nodes, "StickyNote1");
  const font = 14;
  const scale = font / 11;
  const widest = "mask from roto".length * 6 * scale;
  expect(fitted.w).toBeGreaterThanOrEqual(Math.ceil(widest + 16));
  expect(fitted.h).toBeGreaterThanOrEqual(Math.ceil(8 + 2 * font * 1.15 + 8));
});

test("a clone leaves room beside its name for the clone mark", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 0
}
set Ng [stack 0]
clone $Ng {
 inputs 0
 name Grade1Clone
 xpos 120
 ypos 0
}
`);
  const clone = nodeNamed(scene.nodes, "Grade1Clone");
  expect(clone.cloneOf).toBeTruthy();
  expect(clone.w).toBe(Math.ceil("Grade1Clone".length * 6 + 16));
});

test("expressions and clones become straight link arrows", () => {
  const scene = sceneOf(`
Tracker4 {
 inputs 0
 name Tracker1
 xpos 0
 ypos 0
}
Transform {
 name Transform1
 translate {{Tracker1.translate} {Tracker1.translate}}
 xpos 200
 ypos 80
}
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 200
}
set Ng [stack 0]
clone $Ng {
 inputs 0
 name Grade1Clone
 xpos 160
 ypos 200
}
`);
  expect(scene.links).toEqual([
    { fromId: nodeNamed(scene.nodes, "Tracker1").id, toId: nodeNamed(scene.nodes, "Transform1").id, kind: "expression" },
    { fromId: nodeNamed(scene.nodes, "Grade1").id, toId: nodeNamed(scene.nodes, "Grade1Clone").id, kind: "clone" },
  ]);
  const clone = nodeNamed(scene.nodes, "Grade1Clone");
  expect(clone.w).toBe(Math.ceil("Grade1Clone".length * 6 + 16));
});

test("parent and self names are not expression links", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 whitepoint {{parent.whitepoint}}
 xpos 0
 ypos 0
}
Blur {
 name Blur1
 size {{Grade1.size}}
 xpos 0
 ypos 40
}
`);
  const grade = nodeNamed(scene.nodes, "Grade1");
  expect(scene.links.some((link) => link.toId === grade.id)).toBe(false);
  expect(scene.links).toEqual([
    { fromId: grade.id, toId: nodeNamed(scene.nodes, "Blur1").id, kind: "expression" },
  ]);
});

test("a gizmo keeps its internal graph, including a nested group", () => {
  const scene = sceneOf(`
Gizmo {
 name Tool
 inputs 1
}
 Group {
  name Inner
 }
  Grade {
   inputs 0
   name Grade1
  }
  Output {
   name Output1
  }
 end_group
 Output {
  name Output1
 }
end_group
`);
  const tool = nodeNamed(scene.nodes, "Tool");
  expect(tool.className).toBe("Gizmo");
  expect(tool.graph).not.toBeNull();
  expect(tool.graph?.nodes.map((node) => node.name)).toEqual(["Inner", "Output1"]);
  const inner = tool.graph?.nodes.find((node) => node.name === "Inner");
  expect(inner?.graph?.nodes.map((node) => node.name)).toEqual(["Grade1", "Output1"]);
});

test("backdrops use their bounds and sticky notes have no pipes", () => {
  const scene = sceneOf(`
Read {
 inputs 0
 name Read1
 xpos 0
 ypos 0
}
BackdropNode {
 inputs 0
 name BackdropNode1
 bdwidth 200
 bdheight 80
 z_order 3
 xpos -20
 ypos -20
}
StickyNote {
 inputs 0
 name StickyNote1
 label Note
 xpos 0
 ypos 100
}
Grade {
 name Grade1
 xpos 0
 ypos 40
}
`);
  const backdrop = nodeNamed(scene.nodes, "BackdropNode1");
  expect(backdrop.kind).toBe("backdrop");
  expect(backdrop.w).toBe(200);
  expect(backdrop.h).toBe(80);
  expect(backdrop.z).toBe(3);
  const sticky = nodeNamed(scene.nodes, "StickyNote1");
  expect(sticky.kind).toBe("sticky");
  expect(scene.pipes.some((pipe) => pipe.fromId === sticky.id || pipe.toId === sticky.id)).toBe(false);
  expect(nodeNamed(scene.nodes, "Grade1").inputs).toEqual([nodeNamed(scene.nodes, "Read1").id]);
});

test("hide_input removes the pipe into that node", () => {
  const scene = sceneOf(`
Read {
 inputs 0
 name Read1
 xpos 0
 ypos 0
}
Grade {
 name Grade1
 hide_input true
 xpos 0
 ypos 40
}
`);
  expect(scene.pipes).toEqual([]);
  expect(nodeNamed(scene.nodes, "Grade1").hideInput).toBe(true);
});

test("pipes are a straight segment between the anchors", () => {
  const samples = pipeSamples({ x: 0, y: 0, side: "bottom" }, { x: 10, y: 80, side: "top" }, 4);
  expect(samples).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 80 },
  ]);
});

test("nodes without positions stack below each other", () => {
  const scene = sceneOf(`
Grade {
 name Grade1
}
Grade {
 name Grade2
}
`);
  const first = nodeNamed(scene.nodes, "Grade1");
  const second = nodeNamed(scene.nodes, "Grade2");
  expect(Number.isFinite(first.x) && Number.isFinite(first.y)).toBe(true);
  expect(Number.isFinite(second.x) && Number.isFinite(second.y)).toBe(true);
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.h);
  expect(second.y + second.h).toBeGreaterThan(second.y);
});
