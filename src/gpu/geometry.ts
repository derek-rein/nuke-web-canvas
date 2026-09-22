import { classHasMask } from "../nuke/catalog.ts";
import { channelIndicators } from "../nuke/channels.ts";
import {
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
const MODE_BODY = 4;
const MODE_CIRCLE_BODY = 5;
const MODE_DEEP = 6;
const MODE_POINT = 7;
const MODE_PARTICLE = 8;
const MODE_INPUT = 9;
const MODE_OUTPUT = 10;
const MODE_DOT = 11;
const TEXT_ZOOM = 0.28;
const EXPRESSION_LINK: [number, number, number, number] = [0x71 / 255, 0xc9 / 255, 0x73 / 255, 1];
const CLONE_LINK: [number, number, number, number] = [0xe8 / 255, 0x78 / 255, 0x30 / 255, 1];
const PIPE_DOWN: [number, number, number, number] = [0xe6 / 255, 0xae / 255, 0x51 / 255, 1];
const INPUT_LABEL: [number, number, number, number] = [0xfc / 255, 0xba / 255, 0x63 / 255, 1];
const PIPE_OTHER: [number, number, number, number] = [0, 0, 0, 1];
const CLONE_BADGE: [number, number, number, number] = [0xe0 / 255, 0x70 / 255, 0x20 / 255, 1];


export function buildGeometry(
  scene: DagScene,
  zoom: number,
  atlas: GlyphLookup | null,
  selectedIds: ReadonlySet<string> | null,
): Vertex[] {
  const vertices: Vertex[] = [];
  const backdrops = scene.nodes
    .filter((node) => node.kind === "backdrop" || node.kind === "sticky")
    .slice()
    .sort((a, b) => a.z - b.z);
  for (const node of backdrops) {
    if (node.kind === "backdrop") pushBackdrop(vertices, node);
    else pushSticky(vertices, node);
  }
  for (const node of scene.nodes) {
    if (node.hideInput || node.kind === "backdrop" || node.kind === "sticky") continue;
    for (const pipe of scene.pipes) {
      if (pipe.toId !== node.id) continue;
      pushPipe(vertices, pipe.from, pipe.to, node.className === "Viewer");
      if (atlas && zoom >= TEXT_ZOOM) pushPipeLabel(vertices, pipe, atlas);
    }
  }
  pushLinks(vertices, scene);
  const outputConnected = connectedOutputs(scene);
  for (const node of scene.nodes) {
    if (node.kind === "backdrop" || node.kind === "sticky") continue;
    if (selectedIds?.has(node.id) && atlas && zoom >= TEXT_ZOOM) pushLabelBacking(vertices, node, atlas);
    pushNode(vertices, node, outputConnected.has(node.id), selectedIds?.has(node.id) ?? false);
    if (node.cloneOf && node.kind === "node") pushCloneBadge(vertices, node);
    if (node.disabled) pushCross(vertices, node);
    if (node.cloneOf && node.kind === "node" && atlas && zoom >= TEXT_ZOOM) pushCloneMark(vertices, node, atlas);
  }
  for (const node of scene.nodes) {
    if (selectedIds?.has(node.id)) pushSelection(vertices, node);
  }
  if (atlas && zoom >= TEXT_ZOOM) {
    for (const node of scene.nodes) pushText(vertices, node, atlas);
  }
  return vertices;
}

const DOT_SELECT: [number, number, number, number] = [0xfc / 255, 0xba / 255, 0x63 / 255, 1];

function pushNode(vertices: Vertex[], node: DagNode, outputConnected: boolean, selected: boolean): void {
  if (node.kind === "dot") {
    const radius = node.w / 2 - 0.6;
    pushQuad(vertices, node.x, node.y, node.w, node.h, node.color, MODE_DOT, radius);
    if (selected) {
      const diameter = node.w * 0.64;
      pushQuad(
        vertices,
        node.x + (node.w - diameter) / 2,
        node.y + (node.h - diameter) / 2,
        diameter,
        diameter,
        DOT_SELECT,
        MODE_CIRCLE,
        diameter / 2,
      );
    }
    if (!outputConnected) {
      const centerX = node.x + node.w / 2;
      const bottom = node.y + node.h;
      pushArrow(vertices, { x: centerX, y: bottom - 1 }, { x: centerX, y: bottom + 8 }, PORT, 8, 4.5);
    }
    return;
  }
  if (node.postage) {
    pushRoundRect(vertices, node.x, node.y, node.w, 46, [0.12, 0.12, 0.12, 1], 2);
  }
  pushBody(vertices, node);
  pushChannels(vertices, node);
  pushPorts(vertices, node, outputConnected);
}

const PORT: [number, number, number, number] = [0, 0, 0, 1];

function pushPorts(vertices: Vertex[], node: DagNode, outputConnected: boolean): void {
  if (node.kind !== "node" || node.className === "Viewer") return;
  if (!outputConnected) {
    const centerX = node.x + node.w / 2;
    const bottom = node.bodyY + node.bodyH;
    pushArrow(vertices, { x: centerX, y: bottom - 1 }, { x: centerX, y: bottom + 8 }, PORT, 8, 4.5);
  }
  if (node.hideInput || maskIsConnected(node)) return;
  if (node.maskInputs <= 0 && !classHasMask(node.className)) return;
  const midY = node.bodyY + node.bodyH / 2;
  const edge = node.x + node.w;
  pushArrow(vertices, { x: edge + 7, y: midY }, { x: edge - 1, y: midY }, PORT, 7, 3.5);
}

function maskIsConnected(node: DagNode): boolean {
  if (node.maskInputs <= 0) return false;
  const mainCount = node.inputs.length - node.maskInputs;
  return node.inputs.slice(mainCount).some((id) => id != null);
}

function pushBody(vertices: Vertex[], node: DagNode): void {
  const radius = Math.min(node.w, node.bodyH) / 2;
  if (node.shape === "circle") {
    pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_CIRCLE_BODY, radius);
    return;
  }
  if (node.shape === "pill") {
    pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_BODY, radius);
    return;
  }
  if (node.shape === "deep") {
    pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_DEEP, radius);
    return;
  }
  if (node.shape === "point") {
    pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_POINT, radius);
    return;
  }
  if (node.shape === "particle") {
    pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_PARTICLE, radius);
    return;
  }
  if (node.shape === "input") {
    pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_INPUT, 0);
    return;
  }
  if (node.shape === "output") {
    pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_OUTPUT, 0);
    return;
  }
  pushQuad(vertices, node.x, node.bodyY, node.w, node.bodyH, node.color, MODE_BODY, 2);
}

function connectedOutputs(scene: DagScene): Set<string> {
  const connected = new Set<string>();
  for (const node of scene.nodes) {
    for (const inputId of node.inputs) {
      if (inputId) connected.add(inputId);
    }
  }
  return connected;
}

function pushSticky(vertices: Vertex[], node: DagNode): void {
  const radius = 6;
  const border: [number, number, number, number] = [0.15, 0.15, 0.15, 1];
  pushRoundRect(vertices, node.x - 1, node.y - 1, node.w + 2, node.h + 2, border, radius + 1);
  pushRoundRect(vertices, node.x, node.y, node.w, node.h, node.color, radius);
}

function pushBackdrop(vertices: Vertex[], node: DagNode): void {
  pushQuad(vertices, node.x, node.y, node.w, node.h, node.color, MODE_SOLID, 0);
  const lift = lighten(node.color);
  const cut = Math.min(12, node.w / 4, node.h / 4);
  const x = node.x;
  const y = node.y;
  const right = x + node.w;
  const bottom = y + node.h;
  pushTriangle(vertices, [[x, y], [x + cut, y], [x, y + cut]], lift);
  pushTriangle(vertices, [[right, y], [right - cut, y], [right, y + cut]], lift);
  pushTriangle(vertices, [[x, bottom], [x + cut, bottom], [x, bottom - cut]], lift);
  pushTriangle(vertices, [[right, bottom], [right - cut, bottom], [right, bottom - cut]], lift);
  const inset = Math.min(6, node.w / 5);
  const barH = Math.min(18, Math.max(8, node.h - 8));
  pushQuad(vertices, x + inset, y + 2, Math.max(0, node.w - inset * 2), barH, lift, MODE_SOLID, 0);
}

function lighten(color: [number, number, number, number]): [number, number, number, number] {
  return [
    Math.min(1, color[0] + 0.08),
    Math.min(1, color[1] + 0.08),
    Math.min(1, color[2] + 0.08),
    color[3],
  ];
}

function pushTriangle(
  vertices: Vertex[],
  points: Array<[number, number]>,
  color: [number, number, number, number],
): void {
  for (const [x, y] of points) vertices.push(vertex(x, y, color, 0, 0, MODE_SOLID, 0));
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

function pushPipe(vertices: Vertex[], from: Anchor, to: Anchor, dotted: boolean): void {
  const samples = pipeSamples(from, to, 20);
  // Dot anchors sit at the center. The arrow should meet the circle, not disappear inside it.
  if (to.side === "center") pullInside(samples, samples.length - 1, 6);
  if (from.side === "center") pullInside(samples, 0, 6);
  const width = 2;
  const color = pipeColor(from, to);
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = samples[index];
    const b = samples[index + 1];
    if (!a || !b) continue;
    if (dotted) pushDashedSegment(vertices, a, b, width, color);
    else pushSegment(vertices, a, b, width, color);
  }
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  if (last && prev) pushArrow(vertices, prev, last, color, 12, 4);
}

function pushDashedSegment(
  vertices: Vertex[],
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  color: [number, number, number, number],
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const dash = 3;
  const gap = 3;
  const drawLength = Math.max(0, length - 12);
  let traveled = 0;
  while (traveled < drawLength) {
    const end = Math.min(drawLength, traveled + dash);
    pushSegment(
      vertices,
      { x: a.x + ux * traveled, y: a.y + uy * traveled },
      { x: a.x + ux * end, y: a.y + uy * end },
      width,
      color,
    );
    traveled = end + gap;
  }
}

const LINK_HEAD_LENGTH = 8;
const LINK_HEAD_HALF = 3;
const LINK_SHAFT_WIDTH = 1.5;

function pushLinks(vertices: Vertex[], scene: DagScene): void {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const link of scene.links) {
    const source = byId.get(link.fromId);
    const target = byId.get(link.toId);
    if (!source || !target) continue;
    const from = { x: source.x + source.w / 2, y: source.bodyY + source.bodyH / 2 };
    const to = { x: target.x + target.w / 2, y: target.bodyY + target.bodyH / 2 };
    const color = link.kind === "expression" ? EXPRESSION_LINK : CLONE_LINK;
    const targetRect = {
      left: target.x,
      top: target.bodyY,
      right: target.x + target.w,
      bottom: target.bodyY + target.bodyH,
    };
    if (link.kind === "clone") {
      const sourceRect = {
        left: source.x,
        top: source.bodyY,
        right: source.x + source.w,
        bottom: source.bodyY + source.bodyH,
      };
      pushSegment(
        vertices,
        linkEdgePoint(from, to, sourceRect),
        linkEdgePoint(to, from, targetRect),
        LINK_SHAFT_WIDTH,
        color,
      );
      continue;
    }
    const edge = linkEdgePoint(to, from, targetRect);
    const outward = unitPoint(edge.x - to.x, edge.y - to.y);
    const tip = clearLinkHead(edge, outward, targetRect);
    const tail = { x: tip.x + outward.x * LINK_HEAD_LENGTH, y: tip.y + outward.y * LINK_HEAD_LENGTH };
    pushSegment(vertices, from, linkShaftEnd(tip, outward, edge, targetRect), LINK_SHAFT_WIDTH, color);
    pushArrow(vertices, tail, tip, color, LINK_HEAD_LENGTH, LINK_HEAD_HALF);
  }
}

type Point = { x: number; y: number };
type BodyRect = { left: number; top: number; right: number; bottom: number };

function linkEdgePoint(center: Point, toward: Point, rect: BodyRect): Point {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.hypot(dx, dy) < 1e-6) return { x: center.x, y: rect.top };
  let bestT = Number.POSITIVE_INFINITY;
  let hit: Point | null = null;
  const consider = (t: number, x: number, y: number) => {
    if (t <= 1e-8 || t >= bestT) return;
    if (x < rect.left - 1e-3 || x > rect.right + 1e-3) return;
    if (y < rect.top - 1e-3 || y > rect.bottom + 1e-3) return;
    bestT = t;
    hit = { x, y };
  };
  if (dx !== 0) {
    const tLeft = (rect.left - center.x) / dx;
    consider(tLeft, rect.left, center.y + dy * tLeft);
    const tRight = (rect.right - center.x) / dx;
    consider(tRight, rect.right, center.y + dy * tRight);
  }
  if (dy !== 0) {
    const tTop = (rect.top - center.y) / dy;
    consider(tTop, center.x + dx * tTop, rect.top);
    const tBottom = (rect.bottom - center.y) / dy;
    consider(tBottom, center.x + dx * tBottom, rect.bottom);
  }
  return hit ?? { x: center.x, y: rect.top };
}

function unitPoint(x: number, y: number): Point {
  const length = Math.hypot(x, y);
  if (length < 1e-6) return { x: 0, y: -1 };
  return { x: x / length, y: y / length };
}

function clearLinkHead(edge: Point, outward: Point, rect: BodyRect): Point {
  const normal = edgeNormal(edge, outward, rect);
  const align = normal.x * outward.x + normal.y * outward.y;
  if (align <= 1e-8) return edge;
  let shift = 0;
  for (const side of [1, -1]) {
    const ox = outward.x * LINK_HEAD_LENGTH - outward.y * LINK_HEAD_HALF * side;
    const oy = outward.y * LINK_HEAD_LENGTH + outward.x * LINK_HEAD_HALF * side;
    const signed = ox * normal.x + oy * normal.y;
    if (signed < 0) shift = Math.max(shift, -signed / align);
  }
  if (shift > 0) shift += 1e-4;
  return { x: edge.x + outward.x * shift, y: edge.y + outward.y * shift };
}

function linkShaftEnd(tip: Point, outward: Point, edge: Point, rect: BodyRect): Point {
  const normal = edgeNormal(edge, outward, rect);
  const align = normal.x * outward.x + normal.y * outward.y;
  if (align <= 1e-8) return tip;
  const half = LINK_SHAFT_WIDTH / 2;
  let shift = 0;
  for (const side of [1, -1]) {
    const ox = tip.x - edge.x + outward.y * half * side;
    const oy = tip.y - edge.y - outward.x * half * side;
    const signed = ox * normal.x + oy * normal.y;
    if (signed < 0) shift = Math.max(shift, -signed / align);
  }
  if (shift > 0) shift += 1e-4;
  return { x: tip.x + outward.x * shift, y: tip.y + outward.y * shift };
}

function edgeNormal(edge: Point, outward: Point, rect: BodyRect): Point {
  const candidates: Point[] = [];
  if (Math.abs(edge.x - rect.left) <= 1e-3) candidates.push({ x: -1, y: 0 });
  if (Math.abs(edge.x - rect.right) <= 1e-3) candidates.push({ x: 1, y: 0 });
  if (Math.abs(edge.y - rect.top) <= 1e-3) candidates.push({ x: 0, y: -1 });
  if (Math.abs(edge.y - rect.bottom) <= 1e-3) candidates.push({ x: 0, y: 1 });
  let best = candidates[0] ?? { x: 0, y: -1 };
  let bestDot = Number.NEGATIVE_INFINITY;
  for (const normal of candidates) {
    const dot = normal.x * outward.x + normal.y * outward.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = normal;
    }
  }
  return best;
}

function pipeColor(
  from: { x: number; y: number },
  to: { x: number; y: number },
): [number, number, number, number] {
  const dx = Math.abs(to.x - from.x);
  const dy = to.y - from.y;
  return dy > dx ? PIPE_DOWN : PIPE_OTHER;
}

function pullInside(samples: Array<{ x: number; y: number }>, index: number, distance: number): void {
  const point = samples[index];
  const neighbor = samples[index === 0 ? 1 : index - 1];
  if (!point || !neighbor) return;
  const outward = index === 0;
  const dx = outward ? neighbor.x - point.x : point.x - neighbor.x;
  const dy = outward ? neighbor.y - point.y : point.y - neighbor.y;
  const length = Math.hypot(dx, dy) || 1;
  const shift = Math.min(distance, Math.max(0, length - 1));
  const ux = dx / length;
  const uy = dy / length;
  samples[index] = outward
    ? { x: point.x + ux * shift, y: point.y + uy * shift }
    : { x: point.x - ux * shift, y: point.y - uy * shift };
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
  size: number,
  halfWidth: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = to.x - ux * size;
  const baseY = to.y - uy * size;
  const px = -uy * halfWidth;
  const py = ux * halfWidth;
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

/** Tile color behind a selected autolabel. The label is often wider and taller than the tile. */
function pushLabelBacking(vertices: Vertex[], node: DagNode, atlas: GlyphLookup): void {
  if (node.kind !== "node" || node.labelLines.length === 0) return;
  const fontSize = noteFontSize(node.kind, node.knobs);
  const lineHeight = labelLineHeight(fontSize);
  const blockHeight = node.labelLines.length * lineHeight;
  let widest = 0;
  for (const line of node.labelLines) widest = Math.max(widest, atlas.measure(line));
  const pad = 2;
  const w = widest + pad * 2;
  const h = blockHeight + pad * 2;
  if (w <= node.w && h <= node.bodyH) return;
  const x = node.x + node.w / 2 - w / 2;
  const y = node.bodyY + node.bodyH / 2 - h / 2;
  const color: [number, number, number, number] = [node.color[0], node.color[1], node.color[2], 0.6];
  pushQuad(vertices, x, y, w, h, color, MODE_SOLID, 0);
}

function pushSelection(vertices: Vertex[], node: DagNode): void {
  if (node.kind === "dot") return;
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
    x = pipe.to.x + 6;
    centerY = pipe.to.y - 12;
  } else if (pipe.to.side === "left") {
    x = pipe.to.x - width - 6;
    centerY = pipe.to.y - 12;
  } else if (pipe.to.side === "bottom") {
    x = pipe.to.x - width / 2;
    centerY = pipe.to.y + 16;
  } else {
    return;
  }
  pushCenteredGlyphs(vertices, pipe.label, x, centerY, fontSize, INPUT_LABEL, atlas);
}

function pushChannels(vertices: Vertex[], node: DagNode): void {
  const channels = channelIndicators(node.className, node.knobs);
  if (channels.length === 0) return;
  const width = 4;
  const height = 3;
  const gap = 1;
  const total = channels.length * width + (channels.length - 1) * gap;
  const left = node.x + (node.w - total) / 2;
  const top = node.bodyY + node.bodyH - height - 1;
  for (const [index, color] of channels.entries()) {
    pushQuad(vertices, left + index * (width + gap), top, width, height, color, MODE_SOLID, 0);
  }
}

function pushCloneBadge(vertices: Vertex[], node: DagNode): void {
  const diameter = 16;
  const cx = node.x;
  const cy = node.bodyY + node.bodyH / 2;
  pushQuad(vertices, cx - diameter / 2, cy - diameter / 2, diameter, diameter, CLONE_BADGE, MODE_CIRCLE, diameter / 2);
}

function pushText(vertices: Vertex[], node: DagNode, atlas: GlyphLookup): void {
  if (node.labelLines.length === 0) return;
  const fontSize = noteFontSize(node.kind, node.knobs);
  const scale = fontSize / 48;
  const lineHeight = labelLineHeight(fontSize);
  const blockHeight = node.labelLines.length * lineHeight;
  const dotLabel: [number, number, number, number] = [0.86, 0.86, 0.86, 1];
  const headerH = Math.min(18, Math.max(8, node.h - 8));
  const originY =
    node.kind === "dot"
      ? node.y + node.h / 2 - blockHeight / 2
      : node.kind === "backdrop"
        ? node.y + 2 + headerH / 2 - blockHeight / 2
        : node.kind === "sticky"
          ? node.y + node.h / 2 - blockHeight / 2
          : node.bodyY + node.bodyH / 2 - blockHeight / 2;
  node.labelLines.forEach((line, index) => {
    const glyphs = atlas.glyphsFor(line);
    const width = glyphs.reduce((sum, glyph) => sum + glyph.advance * scale, 0);
    let cursor =
      node.kind === "dot"
        ? node.x + node.w + 6
        : node.x + node.w / 2 - width / 2;
    const baseline = originY + index * lineHeight + fontSize;
    for (const glyph of glyphs) {
      pushGlyph(
        vertices,
        cursor + glyph.bearingX * scale,
        baseline - glyph.bearingY * scale,
        glyph.width * scale,
        glyph.height * scale,
        node.kind === "dot" ? dotLabel : node.textColor,
        glyph,
      );
      cursor += glyph.advance * scale;
    }
  });
}

function pushCloneMark(vertices: Vertex[], node: DagNode, atlas: GlyphLookup): void {
  const glyph = atlas.glyphsFor("C")[0];
  if (!glyph) return;
  const fontSize = 12;
  const scale = fontSize / 48;
  const gw = glyph.width * scale;
  const gh = glyph.height * scale;
  pushGlyph(
    vertices,
    node.x - gw / 2,
    node.bodyY + node.bodyH / 2 - gh / 2,
    gw,
    gh,
    [1, 1, 1, 1],
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
