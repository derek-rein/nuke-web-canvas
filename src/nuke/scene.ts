import type { ParsedScript, RawNode } from "./types.ts";
import { classColor, parseTileColor, textColorFor } from "./colors.ts";
import { labelLines } from "./labels.ts";
import { type TclScope } from "./tcl.ts";
import { nodeShape, type NodeShape } from "./shapes.ts";

export type Rgba = [number, number, number, number];

export type AnchorSide = "top" | "left" | "right" | "bottom" | "center";

export type Anchor = { x: number; y: number; side: AnchorSide };

export type DagNode = {
  id: string;
  className: string;
  name: string;
  knobs: Record<string, string>;
  userKnobs: RawNode["userKnobs"];
  inputs: (string | null)[];
  maskInputs: number;
  cloneOf: string | null;
  kind: "node" | "dot" | "backdrop" | "sticky";
  shape: NodeShape;
  x: number;
  y: number;
  w: number;
  h: number;
  bodyY: number;
  bodyH: number;
  color: Rgba;
  textColor: Rgba;
  labelLines: string[];
  disabled: boolean;
  hideInput: boolean;
  postage: boolean;
  z: number;
  graph: DagScene | null;
};

export type Pipe = {
  fromId: string;
  toId: string;
  inputIndex: number;
  label: string;
  from: Anchor;
  to: Anchor;
};

export type LinkArrow = {
  fromId: string;
  toId: string;
  kind: "expression" | "clone";
};

export type DagScene = {
  id: string;
  name: string;
  nodes: DagNode[];
  pipes: Pipe[];
  links: LinkArrow[];
  bounds: { x: number; y: number; w: number; h: number };
  /** Knobs of the group or root that owns this graph. `parent.name` reads them. */
  knobs: Record<string, string>;
  /** Frame TCL expressions use. Root `first_frame`, otherwise 1. */
  frame: number;
};

export type MeasureText = (line: string) => number;

export const NODE_FONT_SIZE = 11;
export const LABEL_PAD = 8;

const EXPRESSION_IGNORE = new Set(["parent", "this", "root", "curve", "frame"]);

const GROUP_CLASSES = new Set(["Group", "Gizmo", "LiveGroup", "VariableGroup"]);

export function noteFontSize(kind: DagNode["kind"], knobs: Record<string, string>): number {
  if (kind === "backdrop" || kind === "sticky") {
    const raw = Number(knobs.note_font_size);
    if (Number.isFinite(raw) && raw > 0) return raw;
    return kind === "backdrop" ? 16 : 14;
  }
  return NODE_FONT_SIZE;
}

export function labelLineHeight(fontSize: number): number {
  return fontSize * 1.15;
}

export function buildScene(script: ParsedScript, measure: MeasureText): DagScene {
  return layout(script.root, measure);
}

export function pipeSamples(from: Anchor, to: Anchor, _steps: number): Array<{ x: number; y: number }> {
  return [
    { x: from.x, y: from.y },
    { x: to.x, y: to.y },
  ];
}

function layout(raw: RawNode, measure: MeasureText, parent?: TclScope): DagScene {
  let autoBottom = -40;
  const nodes = raw.children.map((child) => {
    const node = buildNode(child, measure);
    const xpos = numberKnob(child.knobs.xpos);
    const ypos = numberKnob(child.knobs.ypos);
    if (xpos == null || ypos == null) {
      place(node, 0, autoBottom + 40);
      autoBottom = node.y + node.h;
    }
    return node;
  });
  const frame = numberKnob(plainNumber(raw.knobs.first_frame)) ?? parent?.frame ?? 1;
  const scene: DagScene = {
    id: raw.id,
    name: raw.name,
    nodes,
    knobs: raw.knobs,
    frame,
    pipes: [],
    links: [],
    bounds: { x: 0, y: 0, w: 1, h: 1 },
  };
  seal(scene, measure, { frame, label: raw.name, knobs: raw.knobs, nodes: new Map(), parent });
  return scene;
}

export function expressionScope(node: DagNode, scene: DagScene): TclScope {
  const nodes = new Map(scene.nodes.map((item) => [item.name, item.knobs]));
  return {
    frame: scene.frame,
    label: node.name,
    knobs: node.knobs,
    nodes,
    parent: { frame: scene.frame, label: scene.name, knobs: scene.knobs, nodes: new Map() },
  };
}

function seal(scene: DagScene, measure: MeasureText, owner: TclScope): void {
  scene.frame = owner.frame;
  const nodes = scene.nodes;
  const byName = new Map(nodes.map((node) => [node.name, node.knobs]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const scope: TclScope = { frame: owner.frame, label: node.name, knobs: node.knobs, nodes: byName, parent: owner };
    const lines = labelLines(node.className, node.name, node.kind, node.knobs, scope);
    resize(node, lines, measure);
    if (node.graph) seal(node.graph, measure, scope);
  }
  for (const node of nodes) {
    if (node.kind !== "dot" || node.knobs.tile_color) continue;
    node.color = inheritedDotColor(node, byId, new Set());
    node.textColor = textColorFor(node.color);
  }
  scene.pipes = nodes.flatMap((node) => pipesFor(node, byId));
  scene.links = linkArrows(nodes);
  scene.bounds = boundsOf(nodes);
}

function resize(node: DagNode, lines: string[], measure: MeasureText): void {
  const changed = lines.length !== node.labelLines.length || lines.some((line, index) => line !== node.labelLines[index]);
  node.labelLines = lines;
  if (!changed) return;
  const sized = sizeOf(node.kind, node.shape, lines, measure, node.knobs, node.postage);
  node.w = sized.w;
  node.h = sized.h;
  node.bodyH = sized.bodyH;
  node.bodyY = node.y + sized.stamp;
}

function plainNumber(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function linkArrows(nodes: readonly DagNode[]): LinkArrow[] {
  const links: LinkArrow[] = [];
  const seen = new Set<string>();
  const add = (link: LinkArrow): void => {
    const key = `${link.kind}:${link.fromId}:${link.toId}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(link);
  };
  for (const node of nodes) {
    for (const value of Object.values(node.knobs)) {
      for (const match of value.matchAll(/(?<![\w.])([A-Za-z_][\w]*)\s*\./g)) {
        const name = match[1];
        if (!name || EXPRESSION_IGNORE.has(name)) continue;
        const source = nodes.find((other) => other.id !== node.id && other.name === name);
        if (!source) continue;
        add({ fromId: source.id, toId: node.id, kind: "expression" });
      }
    }
    if (node.cloneOf) add({ fromId: node.cloneOf, toId: node.id, kind: "clone" });
  }
  return links;
}

function buildNode(raw: RawNode, measure: MeasureText): DagNode {
  const kind = kindOf(raw.className);
  const lines = labelLines(raw.className, raw.name, kind, raw.knobs);
  const postage = kind === "node" && truthy(raw.knobs.postage_stamp);
  const shape = kind === "node" ? nodeShape(raw.className) : "rect";
  const sized = sizeOf(kind, shape, lines, measure, raw.knobs, postage);
  const x = numberKnob(raw.knobs.xpos) ?? 0;
  const y = numberKnob(raw.knobs.ypos) ?? 0;
  const color = parseTileColor(raw.knobs.tile_color) ?? classColor(raw.className);
  return {
    id: raw.id,
    className: raw.className,
    name: raw.name,
    knobs: raw.knobs,
    userKnobs: raw.userKnobs,
    inputs: raw.inputs,
    maskInputs: raw.maskInputs,
    cloneOf: raw.cloneOf,
    kind,
    shape,
    x,
    y,
    w: sized.w,
    h: sized.h,
    bodyY: y + sized.stamp,
    bodyH: sized.bodyH,
    color,
    textColor: noteFontColor(raw.knobs.note_font_color) ?? textColorFor(color),
    labelLines: lines,
    disabled: truthy(raw.knobs.disable),
    hideInput: truthy(raw.knobs.hide_input),
    postage,
    z: numberKnob(raw.knobs.z_order) ?? 0,
    graph: GROUP_CLASSES.has(raw.className) ? layout(raw, measure) : null,
  };
}

function place(node: DagNode, x: number, y: number): void {
  const stamp = node.bodyY - node.y;
  node.x = x;
  node.y = y;
  node.bodyY = y + stamp;
}

function pipesFor(node: DagNode, byId: Map<string, DagNode>): Pipe[] {
  if (node.hideInput || node.kind === "backdrop" || node.kind === "sticky") return [];
  const pipes: Pipe[] = [];
  node.inputs.forEach((fromId, inputIndex) => {
    if (!fromId) return;
    const source = byId.get(fromId);
    if (!source) return;
    pipes.push({
      fromId,
      toId: node.id,
      inputIndex,
      label: pipeLabel(node, inputIndex),
      from: outputAnchor(source),
      to: inputAnchor(node, source),
    });
  });
  return pipes;
}

// Classes whose own input_label() is B, then A, then A2, A3... (Nuke 17 Merge2).
const MERGE_ARROW_LABELS = new Set(["Merge2", "DeepMerge", "DeepMerge2", "GeoMerge"]);

// input_label() prints the input index. Dissolve and ParticleMerge are 0-based.
const INDEX_ARROW_LABELS = new Set(["Dissolve", "ParticleMerge"]);

// Op::input_label numbers every arrow when maximum_inputs() is at least 3,
// including a node that only has one or two of those inputs connected.
const NUMBERED_ARROW_LABELS = new Set([
  "Blend",
  "ContactSheet",
  "DeepFromImage",
  "GridWarpTracker",
  "MergeGeo",
  "ModelBuilder",
  "Primatte",
  "Scene",
  "Switch",
  "ZComp",
  "ZMerge",
  "Group",
  "Gizmo",
  "LiveGroup",
  "VariableGroup",
  "Viewer",
]);

function pipeLabel(node: DagNode, index: number): string {
  const mainCount = node.inputs.length - node.maskInputs;
  if (node.maskInputs > 0 && index >= mainCount) return "mask";
  if (node.className === "Keymix") {
    if (index === 0) return "B";
    if (index === 1) return "A";
    return "mask";
  }
  if (node.className === "ScanlineRender") {
    return ["bg", "obj/scn", "cam"][index] ?? "";
  }
  if (MERGE_ARROW_LABELS.has(node.className)) {
    if (index === 0) return "B";
    if (index === 1 && mainCount < 3) return "A";
    return `A${index}`;
  }
  if (INDEX_ARROW_LABELS.has(node.className)) return String(index);

  // Default Op::input_label: blank below 2 inputs, B/A at exactly 2, else index + 1.
  const counted = NUMBERED_ARROW_LABELS.has(node.className) ? Math.max(mainCount, 3) : mainCount;
  if (counted < 2) return "";
  if (counted === 2) {
    if (index === 0) return "B";
    if (index === 1) return "A";
    return "";
  }
  return String(index + 1);
}

function outputAnchor(node: DagNode): Anchor {
  if (node.kind === "dot") return { x: node.x + node.w / 2, y: node.y + node.h / 2, side: "center" };
  return { x: node.x + node.w / 2, y: node.bodyY + node.bodyH, side: "bottom" };
}

function inputAnchor(node: DagNode, source: DagNode): Anchor {
  const center = { x: node.x + node.w / 2, y: node.bodyY + node.bodyH / 2 };
  if (node.kind === "dot") return { ...center, side: "center" };
  const from = outputAnchor(source);
  if (node.shape === "circle") {
    const dx = from.x - center.x;
    const dy = from.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const radius = Math.min(node.w, node.bodyH) / 2;
    return {
      x: center.x + (dx / length) * radius,
      y: center.y + (dy / length) * radius,
      side: dominantSide(dx, dy),
    };
  }
  const rect = { left: node.x, top: node.bodyY, right: node.x + node.w, bottom: node.bodyY + node.bodyH };
  const hit = rectEdge(center, from, rect);
  return { x: hit.x, y: hit.y, side: rectSide(hit, rect, from, center) };
}

function dominantSide(dx: number, dy: number): Anchor["side"] {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

type EdgeRect = { left: number; top: number; right: number; bottom: number };

/** Where the line from `center` toward `outside` crosses the rectangle. */
function rectEdge(center: { x: number; y: number }, outside: { x: number; y: number }, rect: EdgeRect): { x: number; y: number } {
  const dx = outside.x - center.x;
  const dy = outside.y - center.y;
  if (Math.hypot(dx, dy) < 1e-6) return { x: center.x, y: rect.top };
  let bestT = Number.POSITIVE_INFINITY;
  let hit: { x: number; y: number } | null = null;
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

function rectSide(
  hit: { x: number; y: number },
  rect: EdgeRect,
  from: { x: number; y: number },
  center: { x: number; y: number },
): Anchor["side"] {
  const dx = center.x - from.x;
  const dy = center.y - from.y;
  const near = 0.75;
  const faces: Array<{ side: Anchor["side"]; on: boolean; score: number }> = [
    { side: "top", on: Math.abs(hit.y - rect.top) <= near, score: dy },
    { side: "bottom", on: Math.abs(hit.y - rect.bottom) <= near, score: -dy },
    { side: "left", on: Math.abs(hit.x - rect.left) <= near, score: dx },
    { side: "right", on: Math.abs(hit.x - rect.right) <= near, score: -dx },
  ];
  let best: Anchor["side"] = "top";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const face of faces) {
    if (!face.on) continue;
    if (face.score > bestScore) {
      bestScore = face.score;
      best = face.side;
    }
  }
  return best;
}

function inheritedDotColor(node: DagNode, byId: Map<string, DagNode>, seen: Set<string>): Rgba {
  if (seen.has(node.id)) return node.color;
  seen.add(node.id);
  const upstreamId = node.inputs[0];
  if (!upstreamId) return node.color;
  const upstream = byId.get(upstreamId);
  if (!upstream) return node.color;
  if (upstream.kind === "dot" && !upstream.knobs.tile_color) {
    return inheritedDotColor(upstream, byId, seen);
  }
  return upstream.color;
}

function noteFontColor(value: string | undefined): Rgba | null {
  const color = parseTileColor(value);
  if (!color || color[3] === 0) return null;
  return [color[0], color[1], color[2], 1];
}

function sizeOf(
  kind: DagNode["kind"],
  shape: NodeShape,
  lines: string[],
  measure: MeasureText,
  knobs: Record<string, string>,
  postage: boolean,
): { w: number; h: number; bodyH: number; stamp: number } {
  if (kind === "dot") return { w: 12, h: 12, bodyH: 12, stamp: 0 };
  if (kind === "backdrop") {
    const w = numberKnob(knobs.bdwidth) ?? 200;
    const h = numberKnob(knobs.bdheight) ?? 200;
    return { w, h, bodyH: h, stamp: 0 };
  }
  if (kind === "sticky") {
    const fontSize = noteFontSize(kind, knobs);
    const scale = fontSize / NODE_FONT_SIZE;
    const textWidth = lines.reduce((widest, line) => Math.max(widest, measure(line)), 0) * scale;
    const bodyH = Math.ceil(LABEL_PAD + lines.length * labelLineHeight(fontSize) + LABEL_PAD);
    const w = Math.max(100, Math.ceil(textWidth + LABEL_PAD * 2));
    return { w, h: bodyH, bodyH, stamp: 0 };
  }
  // Op tiles stay one size. The autolabel is centered on the tile and spills past it.
  const stamp = postage ? 46 : 0;
  if (shape === "circle") return { w: 52, h: 52 + stamp, bodyH: 52, stamp };
  return { w: 80, h: 18 + stamp, bodyH: 18, stamp };
}

function boundsOf(nodes: DagNode[]): DagScene["bounds"] {
  if (nodes.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.w);
    maxY = Math.max(maxY, node.y + node.h);
  }
  return { x: minX - 40, y: minY - 40, w: maxX - minX + 80, h: maxY - minY + 80 };
}

function kindOf(className: string): DagNode["kind"] {
  if (className === "Dot") return "dot";
  if (className === "BackdropNode") return "backdrop";
  if (className === "StickyNote") return "sticky";
  return "node";
}

function numberKnob(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function truthy(value: string | undefined): boolean {
  return value === "true" || value === "1";
}
