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
  expect(vertices.some((vertex) => vertex.r === 0 && vertex.g === 0 && vertex.b === 0)).toBe(true);
  expect(vertices.some((vertex) => vertex.r === 0.78 && vertex.g === 0.78 && vertex.b === 0.78)).toBe(false);
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

test("merge inputs are labeled outside the node", () => {
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
  const merge = scene.nodes.find((node) => node.name === "Merge1");
  expect(merge).toBeTruthy();
  const pipes = scene.pipes.filter((pipe) => pipe.toId === merge!.id);
  const beside = (label: string, dx: number, dy: number) => {
    const pipe = pipes.find((item) => item.label === label);
    expect(pipe).toBeTruthy();
    return glyphs.some(
      (vertex) =>
        Math.abs(vertex.x - (pipe!.to.x + dx)) < 18 && Math.abs(vertex.y - (pipe!.to.y + dy)) < 16,
    );
  };
  const glyphs = buildGeometry(scene, 1, atlas, null).filter((vertex) => vertex.mode === 3);
  expect(beside("B", 0, -12)).toBe(true);
  expect(beside("A", 0, -12)).toBe(true);
  expect(beside("mask", 12, 0)).toBe(true);
});

test("an expression link head sits outside the destination body", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 0
}
Blur {
 name Blur1
 size {{Grade1.size}}
 xpos 200
 ypos 0
}
`);
  const target = scene.nodes.find((node) => node.name === "Blur1");
  expect(target).toBeTruthy();
  const green = buildGeometry(scene, 1, null, null).filter(
    (vertex) =>
      Math.abs(vertex.r - 0x6c / 255) <= 0.01 &&
      Math.abs(vertex.g - 0xbe / 255) <= 0.01 &&
      Math.abs(vertex.b - 0x6c / 255) <= 0.01,
  );
  // The arrow triangle is emitted after the shaft.
  const head = green.slice(-3);
  expect(head).toHaveLength(3);
  const inside = (vertex: { x: number; y: number }) =>
    vertex.x > target!.x &&
    vertex.x < target!.x + target!.w &&
    vertex.y > target!.bodyY &&
    vertex.y < target!.bodyY + target!.bodyH;
  const outside = (vertex: { x: number; y: number }) =>
    vertex.x < target!.x ||
    vertex.x > target!.x + target!.w ||
    vertex.y < target!.bodyY ||
    vertex.y > target!.bodyY + target!.bodyH;
  expect(head.some(outside)).toBe(true);
  expect(head.every((vertex) => !inside(vertex))).toBe(true);
});

test("expression and clone links use their arrow colors", () => {
  const scene = sceneOf(`
Tracker4 {
 inputs 0
 name Tracker1
 xpos 0
 ypos 0
}
Transform {
 name Transform1
 translate {{Tracker1.translate}}
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
  const vertices = buildGeometry(scene, 1, null, null);
  const expression = vertices.find(
    (vertex) =>
      Math.abs(vertex.r - 0x6c / 255) <= 0.01 && Math.abs(vertex.g - 0xbe / 255) <= 0.01,
  );
  expect(expression).toBeTruthy();
  const cloneLink = vertices.find((vertex) => Math.abs(vertex.r - 0xe8 / 255) <= 0.01);
  expect(cloneLink).toBeTruthy();
});

test("a clone mark sits on the left and the name stays on the node", () => {
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
  const clone = scene.nodes.find((node) => node.name === "Grade1Clone");
  expect(clone).toBeTruthy();
  const vertices = buildGeometry(scene, 1, atlas, null);
  const onNode = vertices.filter(
    (vertex) =>
      vertex.mode === 3 &&
      vertex.y >= clone!.bodyY &&
      vertex.y <= clone!.bodyY + clone!.bodyH &&
      vertex.x >= clone!.x - 8 &&
      vertex.x <= clone!.x + clone!.w,
  );
  const mark = onNode.filter((vertex) => vertex.x < clone!.x + 4);
  const name = onNode.filter((vertex) => vertex.x >= clone!.x + 4);
  expect(mark.length).toBeGreaterThan(0);
  expect(name.length).toBeGreaterThan(0);
  expect(name.every((vertex) => vertex.x >= clone!.x)).toBe(true);
});

test("selection outlines every selected id and skips the rest", () => {
  const scene = sceneOf(`
Grade {
 inputs 0
 name Grade1
 xpos 0
 ypos 0
}
Grade {
 inputs 0
 name Grade2
 xpos 200
 ypos 0
}
Grade {
 inputs 0
 name Grade3
 xpos 400
 ypos 0
}
`);
  const grade1 = scene.nodes.find((node) => node.name === "Grade1");
  const grade2 = scene.nodes.find((node) => node.name === "Grade2");
  const grade3 = scene.nodes.find((node) => node.name === "Grade3");
  expect(grade1 && grade2 && grade3).toBeTruthy();
  const orange = (vertex: { r: number; g: number; b: number }) =>
    vertex.r === 0.98 && vertex.g === 0.6 && vertex.b === 0;
  const around = (node: { x: number; y: number; w: number; h: number }) => {
    const x0 = node.x - 4;
    const y0 = node.y - 4;
    const x1 = node.x + node.w + 4;
    const y1 = node.y + node.h + 4;
    return (vertex: { x: number; y: number }) =>
      vertex.x >= x0 && vertex.x <= x1 && vertex.y >= y0 && vertex.y <= y1;
  };
  expect(buildGeometry(scene, 1, null, null).some(orange)).toBe(false);
  expect(buildGeometry(scene, 1, null, new Set<string>()).some(orange)).toBe(false);
  const marks = buildGeometry(scene, 1, null, new Set([grade1!.id, grade2!.id])).filter(orange);
  const first = marks.filter(around(grade1!));
  const second = marks.filter(around(grade2!));
  expect(first.length).toBeGreaterThan(0);
  expect(second.length).toBe(first.length);
  expect(marks.filter(around(grade3!)).length).toBe(0);
  expect(first.length + second.length).toBe(marks.length);
});
