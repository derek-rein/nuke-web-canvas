import { expect, test } from "vitest";
import { parseNukeScript } from "./parse.ts";
import type { RawNode } from "./types.ts";

function findNamed(node: RawNode, name: string): RawNode {
  const found = searchNamed(node, name);
  if (!found) throw new Error(`missing node ${name}`);
  return found;
}

function searchNamed(node: RawNode, name: string): RawNode | null {
  if (node.name === name) return node;
  for (const child of node.children) {
    const found = searchNamed(child, name);
    if (found) return found;
  }
  return null;
}

test("linear chain connects Grade to Read", () => {
  const script = parseNukeScript(`
Read {
 inputs 0
 name Read1
}
Grade {
 name Grade1
}
`);
  const read = findNamed(script.root, "Read1");
  const grade = findNamed(script.root, "Grade1");
  expect(read.id).toBe("root/Read1");
  expect(grade.className).toBe("Grade");
  expect(grade.inputs).toEqual([read.id]);
  expect(script.root.children.map((child) => child.name)).toEqual(["Read1", "Grade1"]);
});

test("Merge2 input 0 is the most recent node", () => {
  const script = parseNukeScript(`
CheckerBoard2 {
 inputs 0
 name CheckerBoard1
}
Read {
 inputs 0
 name Read1
}
Merge2 {
 inputs 2
 name Merge1
}
`);
  const board = findNamed(script.root, "CheckerBoard1");
  const read = findNamed(script.root, "Read1");
  const merge = findNamed(script.root, "Merge1");
  expect(merge.inputs).toEqual([read.id, board.id]);
  expect(merge.maskInputs).toBe(0);
});

test("set and push rebuild a branch", () => {
  const script = parseNukeScript(`
CheckerBoard2 {
 inputs 0
 name CheckerBoard1
}
set N1 [stack 0]
Grade {
 name Grade1
}
push $N1
Read {
 inputs 0
 name Read1
}
Merge2 {
 inputs 2
 name Merge1
}
Merge2 {
 inputs 2
 name Merge2
}
`);
  const board = findNamed(script.root, "CheckerBoard1");
  const grade = findNamed(script.root, "Grade1");
  const read = findNamed(script.root, "Read1");
  const merge1 = findNamed(script.root, "Merge1");
  const merge2 = findNamed(script.root, "Merge2");
  expect(grade.inputs).toEqual([board.id]);
  expect(merge1.inputs).toEqual([read.id, board.id]);
  expect(merge2.inputs).toEqual([merge1.id, grade.id]);
});

test("push 0 leaves Merge input 0 empty", () => {
  const script = parseNukeScript(`
Read {
 inputs 0
 name Read1
}
push 0
Merge2 {
 inputs 2
 name Merge1
}
`);
  const read = findNamed(script.root, "Read1");
  expect(findNamed(script.root, "Merge1").inputs).toEqual([null, read.id]);
});

test("two pushes on one line push in order", () => {
  const script = parseNukeScript(`
Constant {
 inputs 0
 name SrcA
}
set A [stack 0]
Constant {
 inputs 0
 name SrcB
}
set B [stack 0]
Merge2 {
 inputs 2
 name Eat
}
push $A push $B
Merge2 {
 inputs 2
 name Merge1
}
`);
  const a = findNamed(script.root, "SrcA");
  const b = findNamed(script.root, "SrcB");
  expect(findNamed(script.root, "Merge1").inputs).toEqual([b.id, a.id]);
});

test("inputs N+M pops the mask last", () => {
  const script = parseNukeScript(`
Constant {
 inputs 0
 name C0
}
Constant {
 inputs 0
 name C1
}
Constant {
 inputs 0
 name C2
}
Merge2 {
 inputs 2+1
 name Merge1
}
`);
  const merge = findNamed(script.root, "Merge1");
  expect(merge.maskInputs).toBe(1);
  expect(merge.inputs).toEqual([
    findNamed(script.root, "C2").id,
    findNamed(script.root, "C1").id,
    findNamed(script.root, "C0").id,
  ]);
});

test("groups keep an inner stack and reconnect in the parent", () => {
  const script = parseNukeScript(`
Read {
 inputs 0
 name Read1
}
Group {
 name Group1
}
 Input {
  inputs 0
  name Input1
 }
 Grade {
  name Grade1
 }
 Output {
  name Output1
 }
end_group
Viewer {
 name Viewer1
}
`);
  const read = findNamed(script.root, "Read1");
  const group = findNamed(script.root, "Group1");
  const output = findNamed(script.root, "Output1");
  const viewer = findNamed(script.root, "Viewer1");
  expect(group.className).toBe("Group");
  expect(group.inputs).toEqual([read.id]);
  expect(viewer.inputs).toEqual([group.id]);
  expect(output.id).toBe("root/Group1/Output1");
  expect(group.children.map((child) => child.name)).toEqual(["Input1", "Grade1", "Output1"]);
  expect(output.inputs).toEqual([findNamed(script.root, "Grade1").id]);
  expect(script.root.children.map((child) => child.name)).toEqual(["Read1", "Group1", "Viewer1"]);
});

test("backdrops and sticky notes do not consume the stack", () => {
  const script = parseNukeScript(`
Read {
 inputs 0
 name Read1
}
BackdropNode {
 inputs 0
 name BackdropNode1
}
StickyNote {
 inputs 0
 name StickyNote1
}
Grade {
 name Grade1
}
`);
  const grade = findNamed(script.root, "Grade1");
  expect(grade.inputs).toEqual([findNamed(script.root, "Read1").id]);
  expect(script.root.children.map((child) => child.className)).toEqual([
    "Read",
    "BackdropNode",
    "StickyNote",
    "Grade",
  ]);
});

test("clone copies class and knobs and records its source", () => {
  const script = parseNukeScript(`
Grade {
 inputs 0
 name Grade1
 xpos 0
}
set N1 [stack 0]
clone $N1 {
 name Grade2
 xpos 20
 ypos 40
}
`);
  const source = findNamed(script.root, "Grade1");
  const clone = findNamed(script.root, "Grade2");
  expect(clone.className).toBe("Grade");
  expect(clone.cloneOf).toBe(source.id);
  expect(clone.knobs.name).toBe("Grade2");
  expect(clone.knobs.xpos).toBe("20");
  expect(clone.knobs.ypos).toBe("40");
  expect(clone.knobs.inputs).toBe("0");
});

test("knob values keep braces, quotes, and escaped newlines", () => {
  const script = parseNukeScript(`
Blur {
 inputs 0
 name Blur1
 tile_color 0xe88543ff
 label "hello\\nthere"
 size {10 20}
 message "hello there"
}
`);
  const blur = findNamed(script.root, "Blur1");
  expect(blur.knobs.tile_color).toBe("0xe88543ff");
  expect(blur.knobs.label).toBe("hello\nthere");
  expect(blur.knobs.size).toBe("{10 20}");
  expect(blur.knobs.message).toBe("hello there");
});

test("version survives and layout xml does not swallow the next node", () => {
  const script = parseNukeScript(`
version 15.1 v1
define_window_layout_xml { <a>{x}</a> }
Read {
 inputs 0
 name Read1
}
`);
  expect(script.version).toBe("15.1 v1");
  expect(script.root.children.map((child) => child.name)).toEqual(["Read1"]);
});

test("a missing push variable becomes a null input", () => {
  const script = parseNukeScript(`
push $NOPE
Grade {
 name Grade1
}
`);
  expect(findNamed(script.root, "Grade1").inputs).toEqual([null]);
});

test("missing names are unique inside the group", () => {
  const script = parseNukeScript(`
Grade {
}
Grade {
}
`);
  const [first, second] = script.root.children;
  expect(first?.name).toBe("Grade1");
  expect(second?.name).toBe("Grade2");
  expect(first?.id).toBe("root/Grade1");
  expect(second?.id).toBe("root/Grade2");
  expect(second?.inputs).toEqual(["root/Grade1"]);
});

test("a gizmo script nests its children under the group", () => {
  const script = parseNukeScript(`
Group {
 name MyGizmo
}
 Constant {
  inputs 0
  name Constant1
 }
end_group
`);
  const group = script.root.children[0];
  expect(group?.className).toBe("Group");
  expect(group?.id).toBe("root/MyGizmo");
  expect(group?.children.map((child) => child.id)).toEqual(["root/MyGizmo/Constant1"]);
  expect(script.root.className).toBe("Root");
  expect(script.root.id).toBe("root");
});
