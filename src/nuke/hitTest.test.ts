import { expect, test } from "vitest";
import { hitTest } from "./hitTest.ts";
import { parseNukeScript } from "./parse.ts";
import { buildScene } from "./scene.ts";

const measure = (line: string) => line.length * 6;

function sceneOf(source: string) {
  return buildScene(parseNukeScript(source), measure);
}

test("a point inside a node body hits that node", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 10
 ypos 20
}
`);
  expect(hitTest(scene, 20, 25)?.name).toBe("Grade1");
});

test("a node on top of a backdrop wins the hit", () => {
  const scene = sceneOf(`
BackdropNode {
 inputs 0
 name BackdropNode1
 xpos 0
 ypos 0
 bdwidth 300
 bdheight 200
}
Grade {
 inputs 0
 name Grade1
 xpos 20
 ypos 30
}
`);
  expect(hitTest(scene, 30, 35)?.name).toBe("Grade1");
  expect(hitTest(scene, 5, 5)?.name).toBe("BackdropNode1");
});

test("empty space hits nothing", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 0
}
`);
  expect(hitTest(scene, 500, 500)).toBeNull();
});

test("a dot is hittable inside its box", () => {
  const scene = sceneOf(`
Dot {
 inputs 0
 name Dot1
 xpos 34
 ypos 40
}
`);
  expect(hitTest(scene, 36, 42)?.name).toBe("Dot1");
  expect(hitTest(scene, 20, 40)).toBeNull();
});
