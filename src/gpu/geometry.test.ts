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
  const body = vertices.filter((vertex) => vertex.mode === 4);
  expect(body.length).toBeGreaterThan(0);
  for (const vertex of body) {
    expect(vertex.x).toBeGreaterThanOrEqual(9);
    expect(vertex.x).toBeLessThanOrEqual(91);
    expect(vertex.y).toBeGreaterThanOrEqual(19);
    expect(vertex.y).toBeLessThanOrEqual(39);
  }
});

test("deep, 3D, and material nodes use their Nuke outlines", () => {
  const scene = sceneOf(`
Camera3 {
 inputs 0
 name Camera1
 xpos 0
 ypos 0
}
GeoCard {
 inputs 0
 name GeoCard1
 xpos 120
 ypos 0
}
DeepMerge {
 inputs 0
 name DeepMerge1
 xpos 240
 ypos 0
}
BasicMaterial {
 inputs 0
 name BasicMaterial1
 xpos 400
 ypos 0
}
ParticleEmitter {
 inputs 0
 name ParticleEmitter1
 xpos 560
 ypos 0
}
`);
  const body = (name: string) => {
    const node = scene.nodes.find((item) => item.name === name);
    const vertices = buildGeometry(scene, 1, null, null).filter(
      (vertex) => vertex.mode > 3 && node && vertex.y >= node.bodyY && vertex.y <= node.bodyY + node.bodyH && vertex.x >= node.x && vertex.x <= node.x + node.w,
    );
    return { node, mode: vertices[0]?.mode, radius: vertices[0]?.radius };
  };
  const camera = body("Camera1");
  expect(camera.node?.shape).toBe("circle");
  expect(camera.node?.w).toBe(camera.node?.bodyH);
  expect(camera.mode).toBe(5);
  const card = body("GeoCard1");
  expect(card.node?.shape).toBe("pill");
  expect(card.mode).toBe(4);
  expect(card.radius).toBe((card.node?.bodyH ?? 0) / 2);
  expect(body("DeepMerge1").mode).toBe(6);
  expect(body("BasicMaterial1").mode).toBe(7);
  expect(body("ParticleEmitter1").mode).toBe(8);
});

test("a blur shows an output arrow and an unconnected mask tab", () => {
  const scene = sceneOf(`
Blur {
 inputs 0
 name Blur1
 xpos 0
 ypos 0
}
Read {
 inputs 0
 name Read1
 xpos 200
 ypos 0
}
`);
  const vertices = buildGeometry(scene, 1, null, null).filter((vertex) => vertex.mode === 0);
  const blur = scene.nodes.find((node) => node.name === "Blur1");
  const read = scene.nodes.find((node) => node.name === "Read1");
  expect(blur && read).toBeTruthy();
  const below = vertices.some(
    (vertex) => vertex.y > blur!.bodyY + blur!.bodyH && Math.abs(vertex.x - (blur!.x + blur!.w / 2)) < 8,
  );
  const maskTab = vertices.some((vertex) => vertex.x > blur!.x + blur!.w && Math.abs(vertex.y - (blur!.bodyY + blur!.bodyH / 2)) < 8);
  const readMask = vertices.some((vertex) => vertex.x > read!.x + read!.w && vertex.y >= read!.bodyY && vertex.y <= read!.bodyY + read!.bodyH);
  expect(below).toBe(true);
  expect(maskTab).toBe(true);
  expect(readMask).toBe(false);
});

test("a connected output does not also draw the loose output arrow", () => {
  const scene = sceneOf(`
Blur {
 inputs 0
 name Blur1
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
  const blur = scene.nodes.find((node) => node.name === "Blur1");
  const grade = scene.nodes.find((node) => node.name === "Grade1");
  expect(blur && grade).toBeTruthy();
  const under = (node: NonNullable<typeof blur>) =>
    vertices.some(
      (vertex) =>
        vertex.r === 0 &&
        vertex.g === 0 &&
        vertex.b === 0 &&
        vertex.y > node.bodyY + node.bodyH + 2 &&
        vertex.y < node.bodyY + node.bodyH + 12 &&
        Math.abs(vertex.x - (node.x + node.w / 2)) < 6,
    );
  expect(under(blur!)).toBe(false);
  expect(under(grade!)).toBe(true);
});

test("hide input conceals the pipe but the source stays connected", () => {
  const scene = sceneOf(`
Blur {
 inputs 0
 name Blur1
 xpos 0
 ypos 0
}
Grade {
 name Grade1
 hide_input true
 xpos 0
 ypos 80
}
`);
  const vertices = buildGeometry(scene, 1, null, null).filter((vertex) => vertex.mode === 0);
  const blur = scene.nodes.find((node) => node.name === "Blur1");
  const grade = scene.nodes.find((node) => node.name === "Grade1");
  expect(blur && grade).toBeTruthy();
  expect(scene.pipes).toEqual([]);
  const under = (node: NonNullable<typeof blur>) =>
    vertices.some(
      (vertex) =>
        vertex.r === 0 &&
        vertex.g === 0 &&
        vertex.b === 0 &&
        vertex.y > node.bodyY + node.bodyH + 2 &&
        vertex.y < node.bodyY + node.bodyH + 12 &&
        Math.abs(vertex.x - (node.x + node.w / 2)) < 6,
    );
  expect(under(blur!)).toBe(false);
  expect(under(grade!)).toBe(true);
});

test("a sticky note is a bordered rounded box with centered text", () => {
  const scene = sceneOf(`
StickyNote {
 inputs 0
 name StickyNote1
 label "type note here"
 xpos 0
 ypos 0
}
`);
  const note = scene.nodes.find((node) => node.name === "StickyNote1");
  expect(note).toBeTruthy();
  expect(note!.color[0]).toBeCloseTo(0xcc / 255, 2);
  expect(note!.color[1]).toBeCloseTo(0xcc / 255, 2);
  expect(note!.color[2]).toBeCloseTo(0x80 / 255, 2);
  const vertices = buildGeometry(scene, 1, atlas, null);
  const border = vertices.some(
    (vertex) =>
      vertex.mode === 1 &&
      vertex.r < 0.2 &&
      vertex.x < note!.x &&
      vertex.y >= note!.y - 1 &&
      vertex.y <= note!.y + note!.h,
  );
  expect(border).toBe(true);
  const text = vertices.filter((vertex) => vertex.mode === 3);
  expect(text.length).toBeGreaterThan(0);
  const midX = note!.x + note!.w / 2;
  const midY = note!.y + note!.h / 2;
  expect(text.some((vertex) => Math.abs(vertex.x - midX) < 8 && Math.abs(vertex.y - midY) < note!.h / 2)).toBe(true);
});

test("a dot becomes a diamond", () => {
  const scene = sceneOf(`
Dot {
 inputs 0
 name Dot1
 xpos 0
 ypos 0
}
`);
  const vertices = buildGeometry(scene, 1, null, null);
  expect(vertices.some((vertex) => vertex.mode === 11)).toBe(true);
});

test("a pipe into a viewer is dashed", () => {
  const scene = sceneOf(`
Constant {
 inputs 0
 name Constant1
 xpos 0
 ypos 0
}
Viewer {
 name Viewer1
 xpos 160
 ypos 0
}
`);
  const viewer = scene.nodes.find((node) => node.name === "Viewer1");
  const constant = scene.nodes.find((node) => node.name === "Constant1");
  expect(viewer).toBeTruthy();
  expect(constant).toBeTruthy();
  const y = constant!.bodyY + constant!.bodyH / 2;
  const xs = buildGeometry(scene, 1, null, null)
    .filter(
      (vertex) =>
        vertex.mode === 0 &&
        vertex.r === 0 &&
        vertex.g === 0 &&
        vertex.b === 0 &&
        Math.abs(vertex.y - y) < 2 &&
        vertex.x > constant!.x + constant!.w &&
        vertex.x < viewer!.x,
    )
    .map((vertex) => vertex.x)
    .sort((a, b) => a - b);
  expect(xs.length).toBeGreaterThan(0);
  let gap = 0;
  for (let index = 1; index < xs.length; index += 1) {
    gap = Math.max(gap, xs[index]! - xs[index - 1]!);
  }
  expect(gap).toBeGreaterThan(2);
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
  expect(
    vertices.some(
      (vertex) =>
        Math.abs(vertex.r - 0xe6 / 255) <= 0.01 &&
        Math.abs(vertex.g - 0xae / 255) <= 0.01 &&
        Math.abs(vertex.b - 0x51 / 255) <= 0.01,
    ),
  ).toBe(true);
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
  expect(vertices[0]?.mode).toBe(0);
  expect(vertices[0]?.g).toBe(1);
  expect(vertices[0]?.r).toBe(0);
  const backdrop = scene.nodes.find((node) => node.name === "BackdropNode1");
  expect(backdrop).toBeTruthy();
  const title = buildGeometry(scene, 1, atlas, null).filter(
    (vertex) =>
      vertex.mode === 3 &&
      vertex.y < backdrop!.y + 22 &&
      Math.abs(vertex.x - (backdrop!.x + backdrop!.w / 2)) < backdrop!.w / 3,
  );
  expect(title.length).toBeGreaterThan(0);
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
  const geometry = buildGeometry(scene, 1, atlas, null);
  const glyphs = geometry.filter((vertex) => vertex.mode === 3);
  expect(beside("B", 0, -12)).toBe(true);
  expect(beside("A", 0, -12)).toBe(true);
  expect(beside("mask", 12, 0)).toBe(true);
  const letters = glyphs.filter((vertex) =>
    pipes.some(
      (pipe) =>
        pipe.label !== "" &&
        Math.abs(vertex.x - pipe.to.x) < 30 &&
        Math.abs(vertex.y - (pipe.to.y - (pipe.to.side === "top" ? 16 : 12))) < 12,
    ),
  );
  expect(letters.length).toBeGreaterThan(0);
  for (const vertex of letters) {
    expect(vertex.r).toBeCloseTo(0xfc / 255, 2);
    expect(vertex.g).toBeCloseTo(0xba / 255, 2);
    expect(vertex.b).toBeCloseTo(0x63 / 255, 2);
  }
  const plate = geometry.some(
    (vertex) => vertex.mode === 1 && vertex.y < merge!.bodyY && vertex.r < 0.2 && vertex.g < 0.2 && vertex.b < 0.2,
  );
  expect(plate).toBe(false);
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
      Math.abs(vertex.r - 0x71 / 255) <= 0.01 &&
      Math.abs(vertex.g - 0xc9 / 255) <= 0.01 &&
      Math.abs(vertex.b - 0x73 / 255) <= 0.01,
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
      Math.abs(vertex.r - 0x71 / 255) <= 0.01 && Math.abs(vertex.g - 0xc9 / 255) <= 0.01,
  );
  expect(expression).toBeTruthy();
  const cloneLink = vertices.find((vertex) => Math.abs(vertex.r - 0xe8 / 255) <= 0.01);
  expect(cloneLink).toBeTruthy();
});

test("a clone connection is a line with no arrow head", () => {
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
 xpos 160
 ypos 0
}
`);
  const source = scene.nodes.find((node) => node.name === "Grade1");
  const clone = scene.nodes.find((node) => node.name === "Grade1Clone");
  expect(source).toBeTruthy();
  expect(clone).toBeTruthy();
  const orange = buildGeometry(scene, 1, null, null).filter(
    (vertex) => Math.abs(vertex.r - 0xe8 / 255) <= 0.01 && Math.abs(vertex.g - 0x78 / 255) <= 0.01,
  );
  expect(orange.length).toBeGreaterThan(0);
  const x0 = source!.x + source!.w;
  const x1 = clone!.x;
  const y = source!.bodyY + source!.bodyH / 2;
  for (const vertex of orange) {
    expect(vertex.x).toBeGreaterThanOrEqual(x0 - 1);
    expect(vertex.x).toBeLessThanOrEqual(x1 + 1);
    expect(Math.abs(vertex.y - y)).toBeLessThanOrEqual(1);
  }
  expect(Math.min(...orange.map((vertex) => vertex.x))).toBeLessThan(x0 + 2);
  expect(Math.max(...orange.map((vertex) => vertex.x))).toBeGreaterThan(x1 - 2);
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
