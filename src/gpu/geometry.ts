import { pipeSamples, type Anchor, type DagNode, type DagScene } from "../nuke/scene.ts";

export type Vertex = {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  u: number;
  v: number;
  mode: number;
  radius: number;
};

export type Glyph = {
  char: string;
  advance: number;
  width: number;
  height: number;
  bearingX: number;
  bearingY: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};

export type GlyphLookup = {
  measure(line: string): number;
  glyphsFor(line: string): Glyph[];
};

const MODE_SOLID = 0;
const MODE_ROUND = 1;
const MODE_CIRCLE = 2;
const MODE_GLYPH = 3;
const TEXT_ZOOM = 0.28;

export function buildGeometry(
  scene: DagScene,
  zoom: number,
  atlas: GlyphLookup | null,
  selectedId: string | null,
): Vertex[] {
  const vertices: Vertex[] = [];
  const backdrops = scene.nodes
    .filter((node) => node.kind === "backdrop" || node.kind === "sticky")
    .slice()
    .sort((a, b) => a.z - b.z);
  for (const node of backdrops) {
    pushRoundRect(vertices, node.x, node.y, node.w, node.h, node.color, node.kind === "backdrop" ? 8 : 2);
  }
  for (const node of scene.nodes) {
    if (node.hideInput || node.kind === "backdrop" || node.kind === "sticky") continue;
    for (const pipe of scene.pipes) {
      if (pipe.toId !== node.id) continue;
      pushPipe(vertices, pipe.from, pipe.to, zoom);
    }
  }
  for (const node of scene.nodes) {
    if (node.kind === "backdrop" || node.kind === "sticky") continue;
    pushNode(vertices, node);
    if (node.cloneOf) {
      pushQuad(
        vertices,
        node.x + node.w - 10,
        node.bodyY + 2,
        8,
        8,
        [0.96, 0.96, 0.96, 0.9],
        MODE_SOLID,
        0,
      );
    }
    if (node.disabled) pushCross(vertices, node);
    if (node.cloneOf && atlas && zoom >= TEXT_ZOOM) pushCloneMark(vertices, node, atlas);
    if (selectedId === node.id) pushSelection(vertices, node);
  }
  if (atlas && zoom >= TEXT_ZOOM) {
    for (const node of scene.nodes) pushText(vertices, node, atlas);
  }
  return vertices;
}

function pushNode(vertices: Vertex[], node: DagNode): void {
  if (node.kind === "dot") {
    pushQuad(vertices, node.x, node.y, node.w, node.h, node.color, MODE_CIRCLE, node.w / 2);
    return;
  }
  if (node.postage) {
    pushRoundRect(vertices, node.x, node.y, node.w, 46, [0.12, 0.12, 0.12, 1], 2);
  }
  pushRoundRect(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, 3);
}

function pushRoundRect(
  vertices: Vertex[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
  radius: number,
): void {
  pushQuad(vertices, x, y, w, h, color, MODE_ROUND, radius);
}

function pushQuad(
  vertices: Vertex[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
  mode: number,
  radius: number,
): void {
  const corners = [
    [x, y, -w / 2, -h / 2],
    [x + w, y, w / 2, -h / 2],
    [x + w, y + h, w / 2, h / 2],
    [x, y, -w / 2, -h / 2],
    [x + w, y + h, w / 2, h / 2],
    [x, y + h, -w / 2, h / 2],
  ];
  for (const [px, py, u, v] of corners) {
    vertices.push(vertex(px ?? 0, py ?? 0, color, u ?? 0, v ?? 0, mode, radius));
  }
}

function pushPipe(
  vertices: Vertex[],
  from: Anchor,
  to: Anchor,
  zoom: number,
): void {
  const samples = pipeSamples(from, to, 20);
  const width = Math.max(2, 1 / Math.max(zoom, 0.0001));
  const color: [number, number, number, number] = [0.78, 0.78, 0.78, 1];
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = samples[index];
    const b = samples[index + 1];
    if (!a || !b) continue;
    pushSegment(vertices, a, b, width, color);
  }
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  if (last && prev) pushArrow(vertices, prev, last, color);
}

function pushSegment(
  vertices: Vertex[],
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  color: [number, number, number, number],
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);
  const quad: Array<[number, number]> = [
    [a.x + nx, a.y + ny],
    [a.x - nx, a.y - ny],
    [b.x - nx, b.y - ny],
    [a.x + nx, a.y + ny],
    [b.x - nx, b.y - ny],
    [b.x + nx, b.y + ny],
  ];
  for (const [x, y] of quad) vertices.push(vertex(x, y, color, 0, 0, MODE_SOLID, 0));
}

function pushArrow(
  vertices: Vertex[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: [number, number, number, number],
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const size = 7;
  const baseX = to.x - ux * size;
  const baseY = to.y - uy * size;
  const px = -uy * (size * 0.55);
  const py = ux * (size * 0.55);
  const triangle: Array<[number, number]> = [
    [to.x, to.y],
    [baseX + px, baseY + py],
    [baseX - px, baseY - py],
  ];
  for (const [x, y] of triangle) vertices.push(vertex(x, y, color, 0, 0, MODE_SOLID, 0));
}

function pushCross(vertices: Vertex[], node: DagNode): void {
  const color: [number, number, number, number] = [0.9, 0.15, 0.15, 1];
  const inset = 3;
  const x = node.x + inset;
  const y = node.bodyY + inset;
  const w = node.w - inset * 2;
  const h = node.bodyH - inset * 2;
  pushSegment(vertices, { x, y }, { x: x + w, y: y + h }, 1.5, color);
  pushSegment(vertices, { x: x + w, y }, { x, y: y + h }, 1.5, color);
}

function pushSelection(vertices: Vertex[], node: DagNode): void {
  const color: [number, number, number, number] = [0.98, 0.6, 0, 1];
  const pad = 3;
  const x = node.x - pad;
  const y = node.bodyY - pad;
  const w = node.w + pad * 2;
  const h = node.bodyH + pad * 2;
  const t = 2;
  pushRoundRect(vertices, x, y, w, t, color, 1);
  pushRoundRect(vertices, x, y + h - t, w, t, color, 1);
  pushRoundRect(vertices, x, y, t, h, color, 1);
  pushRoundRect(vertices, x + w - t, y, t, h, color, 1);
}

function pushText(vertices: Vertex[], node: DagNode, atlas: GlyphLookup): void {
  if (node.labelLines.length === 0) return;
  const fontSize = textSize(node);
  const scale = fontSize / 48;
  const lineHeight = fontSize * 1.15;
  const blockHeight = node.labelLines.length * lineHeight;
  let originY: number;
  if (node.kind === "backdrop" || node.kind === "sticky") originY = node.y + 8;
  else originY = node.bodyY + node.bodyH / 2 - blockHeight / 2;
  node.labelLines.forEach((line, index) => {
    const glyphs = atlas.glyphsFor(line);
    const width = glyphs.reduce((sum, glyph) => sum + glyph.advance * scale, 0);
    let cursor =
      node.kind === "backdrop" || node.kind === "sticky" ? node.x + 8 : node.x + node.w / 2 - width / 2;
    const baseline = originY + index * lineHeight + fontSize;
    for (const glyph of glyphs) {
      const gx = cursor + glyph.bearingX * scale;
      const gy = baseline - glyph.bearingY * scale;
      const gw = glyph.width * scale;
      const gh = glyph.height * scale;
      pushGlyph(vertices, gx, gy, gw, gh, node.textColor, glyph);
      cursor += glyph.advance * scale;
    }
  });
}

function pushCloneMark(vertices: Vertex[], node: DagNode, atlas: GlyphLookup): void {
  const glyphs = atlas.glyphsFor("C");
  const glyph = glyphs[0];
  if (!glyph) return;
  const size = 8;
  const scale = size / 48;
  const x = node.x + node.w - size - 2;
  const y = node.bodyY + 1;
  pushGlyph(vertices, x, y, glyph.width * scale, glyph.height * scale, [0.96, 0.96, 0.96, 0.9], glyph);
}

function pushGlyph(
  vertices: Vertex[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
  glyph: Glyph,
): void {
  const corners: Array<[number, number, number, number]> = [
    [x, y, glyph.u0, glyph.v0],
    [x + w, y, glyph.u1, glyph.v0],
    [x + w, y + h, glyph.u1, glyph.v1],
    [x, y, glyph.u0, glyph.v0],
    [x + w, y + h, glyph.u1, glyph.v1],
    [x, y + h, glyph.u0, glyph.v1],
  ];
  for (const [px, py, u, v] of corners) {
    vertices.push(vertex(px, py, color, u, v, MODE_GLYPH, 0));
  }
}

function textSize(node: DagNode): number {
  if (node.kind === "backdrop" || node.kind === "sticky") {
    const raw = Number(node.knobs.note_font_size);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return node.kind === "backdrop" ? 16 : 14;
  }
  return 11;
}

function vertex(
  x: number,
  y: number,
  color: [number, number, number, number],
  u: number,
  v: number,
  mode: number,
  radius: number,
): Vertex {
  return { x, y, r: color[0], g: color[1], b: color[2], a: color[3], u, v, mode, radius };
}
