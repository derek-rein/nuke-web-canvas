import { expect, test } from "vitest";
import { buildGeometry, type GlyphLookup } from "./geometry.ts";
import { parseNukeScript } from "../nuke/parse.ts";
import { buildScene } from "../nuke/scene.ts";

const measure = (line: string) => line.length * 6;

function sceneOf(source: string) {
  return buildScene(parseNukeScript(source), measure);
}

const atlas: GlyphLookup = {
  measure: (line) => line.length * 6,
  glyphsFor: (line) =>
    [...line].map((char) => ({
      char,
      advance: 6,
      width: 6,
      height: 11,
      bearingX: 0,
      bearingY: 11,
      u0: 0,
      v0: 0,
      u1: 1,
      v1: 1,
    })),
};

test("a node becomes round-rect vertices inside its rectangle", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 10
 ypos 20
}
`);
  const vertices = buildGeometry(scene, 1, null, null);
  const body = vertices.filter((vertex) => vertex.mode === 1);
  expect(body.length).toBeGreaterThan(0);
  for (const vertex of body) {
    expect(vertex.x).toBeGreaterThanOrEqual(9);
    expect(vertex.x).toBeLessThanOrEqual(91);
    expect(vertex.y).toBeGreaterThanOrEqual(19);
    expect(vertex.y).toBeLessThanOrEqual(39);
  }
});

test("a dot becomes circle vertices", () => {
  const scene = sceneOf(`
Dot {
 inputs 0
 name Dot1
 xpos 0
 ypos 0
}
`);
  const vertices = buildGeometry(scene, 1, null, null);
  expect(vertices.some((vertex) => vertex.mode === 2)).toBe(true);
});

test("a pipe reaches both anchors", () => {
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
 ypos 80
}
`);
  const vertices = buildGeometry(scene, 1, null, null).filter((vertex) => vertex.mode === 0);
  const grade = scene.nodes.find((node) => node.name === "Grade1");
  const source = scene.nodes.find((node) => node.name === "Constant1");
  expect(grade && source).toBeTruthy();
  const from = { x: source!.x + source!.w / 2, y: source!.bodyY + source!.bodyH };
  const to = { x: grade!.x + grade!.w / 2, y: grade!.bodyY };
  expect(vertices.some((vertex) => Math.hypot(vertex.x - from.x, vertex.y - from.y) <= 2)).toBe(true);
  expect(vertices.some((vertex) => Math.hypot(vertex.x - to.x, vertex.y - to.y) <= 2)).toBe(true);
});

test("glyphs appear only when zoomed in", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 0
}
`);
  const close = buildGeometry(scene, 1, atlas, null);
  const far = buildGeometry(scene, 0.2, atlas, null);
  expect(close.some((vertex) => vertex.mode === 3)).toBe(true);
  expect(far.some((vertex) => vertex.mode === 3)).toBe(false);
});

test("a disabled node draws a red cross inside the body", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 disable true
 xpos 0
 ypos 0
}
`);
  const grade = scene.nodes[0]!;
  const cross = buildGeometry(scene, 1, null, null).filter(
    (vertex) => vertex.r === 0.9 && vertex.g === 0.15 && vertex.b === 0.15,
  );
  expect(cross.length).toBeGreaterThan(0);
  expect(
    cross.some(
      (vertex) =>
        vertex.x >= grade.x &&
        vertex.x <= grade.x + grade.w &&
        vertex.y >= grade.bodyY &&
        vertex.y <= grade.bodyY + grade.bodyH,
    ),
  ).toBe(true);
});

test("backdrops are drawn before nodes", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 10
 ypos 10
}
BackdropNode {
 inputs 0
 name BackdropNode1
 tile_color 0x00ff00ff
 xpos 0
 ypos 0
 bdwidth 200
 bdheight 120
}
`);
  const vertices = buildGeometry(scene, 1, null, null);
  expect(vertices[0]?.mode).toBe(1);
  expect(vertices[0]?.g).toBe(1);
  expect(vertices[0]?.r).toBe(0);
});

test("selection adds an orange outline only for the selected id", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 0
}
`);
  const id = scene.nodes[0]!.id;
  const plain = buildGeometry(scene, 1, null, null);
  const selected = buildGeometry(scene, 1, null, id);
  const orange = (vertex: { r: number; g: number; b: number }) =>
    vertex.r === 0.98 && vertex.g === 0.6 && vertex.b === 0;
  expect(plain.some(orange)).toBe(false);
  expect(selected.some(orange)).toBe(true);
});
