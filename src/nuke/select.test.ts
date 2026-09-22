import { expect, test } from "vitest";
import { parseNukeScript } from "./parse.ts";
import { buildScene } from "./scene.ts";
import { neighborId, nodesInRect, toggleId, upstreamIds } from "./select.ts";

const measure = (line: string) => line.length * 6;
function sceneOf(source: string) {
  return buildScene(parseNukeScript(source), measure);
}

test("a rect includes a node it touches and skips one it misses", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 10
 ypos 20
}
`);
  const hit = nodesInRect(scene, { x: 10, y: 20, w: 1, h: 1 });
  expect(hit.map((node) => node.name)).toEqual(["Grade1"]);
  expect(nodesInRect(scene, { x: 0, y: 0, w: 9, h: 9 })).toEqual([]);
});

test("toggleId adds and then removes an id", () => {
  expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
  expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
});

test("upstreamIds walks through a dot once", () => {
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
  const grade = scene.nodes.find((node) => node.name === "Grade1")!;
  const names = upstreamIds(scene, grade.id).map((id) => scene.nodes.find((node) => node.id === id)?.name);
  expect(names).toEqual(["Grade1", "Dot1", "Constant1"]);
});

test("neighborId steps up to the input and down to the user", () => {
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
  const constant = scene.nodes.find((node) => node.name === "Constant1")!;
  const grade = scene.nodes.find((node) => node.name === "Grade1")!;
  expect(neighborId(scene, grade.id, "up")).toBe(constant.id);
  expect(neighborId(scene, constant.id, "down")).toBe(grade.id);
  expect(neighborId(scene, constant.id, "up")).toBeNull();
});
