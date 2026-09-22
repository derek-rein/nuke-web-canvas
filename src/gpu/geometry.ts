import {
  CLONE_MARK,
  LABEL_PAD,
  labelLineHeight,
  noteFontSize,
  pipeSamples,
  type Anchor,
  type DagNode,
  type DagScene,
  type Pipe,
} from "../nuke/scene.ts";

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
      if (atlas && zoom >= TEXT_ZOOM) pushPipeLabel(vertices, pipe, atlas);
    }
  }
  for (const node of scene.nodes) {
    if (node.kind === "backdrop" || node.kind === "sticky") continue;
    pushNode(vertices, node);
    if (node.cloneOf && node.kind === "node") pushCloneChip(vertices, node);
    if (node.disabled) pushCross(vertices, node);
    if (node.cloneOf && node.kind === "node" && atlas && zoom >= TEXT_ZOOM) pushCloneMark(vertices, node, atlas);
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
  _zoom: number,
): void {
  const samples = pipeSamples(from, to, 20);
  const width = 2;
  const color: [number, number, number, number] = [0, 0, 0, 1];
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
  const size = 12;
  const baseX = to.x - ux * size;
  const baseY = to.y - uy * size;
  const px = -uy * 4;
  const py = ux * 4;
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

function pushPipeLabel(vertices: Vertex[], pipe: Pipe, atlas: GlyphLookup): void {
  if (!pipe.label) return;
  const fontSize = 10;
  const width = glyphWidth(pipe.label, fontSize, atlas);
  let x = pipe.to.x;
  let centerY = pipe.to.y;
  if (pipe.to.side === "top") {
    x = pipe.to.x - width / 2;
    centerY = pipe.to.y - 16;
  } else if (pipe.to.side === "right") {
    x = pipe.to.x + 8;
    centerY = pipe.to.y - 12;
  } else if (pipe.to.side === "left") {
    x = pipe.to.x - width - 8;
    centerY = pipe.to.y - 12;
  } else {
    return;
  }
  const plateH = fontSize + 4;
  pushRoundRect(vertices, x - 3, centerY - plateH / 2, width + 6, plateH, [0.07, 0.07, 0.07, 1], 2);
  pushCenteredGlyphs(vertices, pipe.label, x, centerY, fontSize, [0.95, 0.95, 0.95, 1], atlas);
}

function pushCloneChip(vertices: Vertex[], node: DagNode): void {
  const chip = CLONE_MARK - 2;
  const chipH = Math.min(chip, Math.max(1, node.bodyH - 4));
  pushRoundRect(
    vertices,
    node.x + node.w - CLONE_MARK + 1,
    node.bodyY + 2,
    chip,
    chipH,
    [0.1, 0.1, 0.1, 1],
    2,
  );
}

function pushText(vertices: Vertex[], node: DagNode, atlas: GlyphLookup): void {
  if (node.labelLines.length === 0) return;
  const fontSize = noteFontSize(node.kind, node.knobs);
  const scale = fontSize / 48;
  const lineHeight = labelLineHeight(fontSize);
  const blockHeight = node.labelLines.length * lineHeight;
  const reserve = node.cloneOf && node.kind === "node" ? CLONE_MARK : 0;
  const originY =
    node.kind === "backdrop" || node.kind === "sticky"
      ? node.y + LABEL_PAD
      : node.bodyY + node.bodyH / 2 - blockHeight / 2;
  node.labelLines.forEach((line, index) => {
    const glyphs = atlas.glyphsFor(line);
    const width = glyphs.reduce((sum, glyph) => sum + glyph.advance * scale, 0);
    let cursor =
      node.kind === "backdrop" || node.kind === "sticky"
        ? node.x + LABEL_PAD
        : node.x + (node.w - reserve) / 2 - width / 2;
    const baseline = originY + index * lineHeight + fontSize;
    for (const glyph of glyphs) {
      pushGlyph(
        vertices,
        cursor + glyph.bearingX * scale,
        baseline - glyph.bearingY * scale,
        glyph.width * scale,
        glyph.height * scale,
        node.textColor,
        glyph,
      );
      cursor += glyph.advance * scale;
    }
  });
}

function pushCloneMark(vertices: Vertex[], node: DagNode, atlas: GlyphLookup): void {
  const glyph = atlas.glyphsFor("C")[0];
  if (!glyph) return;
  const fontSize = 9;
  const scale = fontSize / 48;
  const chip = CLONE_MARK - 2;
  const chipH = Math.min(chip, Math.max(1, node.bodyH - 4));
  const gw = glyph.width * scale;
  const gh = glyph.height * scale;
  pushGlyph(
    vertices,
    node.x + node.w - CLONE_MARK + 1 + (chip - gw) / 2,
    node.bodyY + 2 + (chipH - gh) / 2,
    gw,
    gh,
    [0.97, 0.97, 0.97, 1],
    glyph,
  );
}

function pushCenteredGlyphs(
  vertices: Vertex[],
  text: string,
  x: number,
  centerY: number,
  fontSize: number,
  color: [number, number, number, number],
  atlas: GlyphLookup,
): void {
  const scale = fontSize / 48;
  let cursor = x;
  for (const glyph of atlas.glyphsFor(text)) {
    const gw = glyph.width * scale;
    const gh = glyph.height * scale;
    pushGlyph(vertices, cursor + glyph.bearingX * scale, centerY - gh / 2, gw, gh, color, glyph);
    cursor += glyph.advance * scale;
  }
}

function glyphWidth(text: string, fontSize: number, atlas: GlyphLookup): number {
  const scale = fontSize / 48;
  return atlas.glyphsFor(text).reduce((sum, glyph) => sum + glyph.advance * scale, 0);
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
