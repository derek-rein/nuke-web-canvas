import type { ParsedScript, RawNode } from "./types.ts";
import { classColor, parseTileColor, textColorFor } from "./colors.ts";
import { nodeShape, type NodeShape } from "./shapes.ts";

export type Rgba = [number, number, number, number];

export type AnchorSide = "top" | "left" | "right" | "bottom" | "center";

export type Anchor = { x: number; y: number; side: AnchorSide };

export type DagNode = {
  id: string;
  className: string;
  name: string;
  knobs: Record<string, string>;
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

function layout(raw: RawNode, measure: MeasureText): DagScene {
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
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (node.kind !== "dot" || node.knobs.tile_color) continue;
    node.color = inheritedDotColor(node, byId, new Set());
    node.textColor = textColorFor(node.color);
  }
  const pipes = nodes.flatMap((node) => pipesFor(node, byId));
  return {
    id: raw.id,
    name: raw.name,
    nodes,
    pipes,
    links: linkArrows(nodes),
    bounds: boundsOf(nodes),
  };
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
  const labelLines = linesFor(raw, kind);
  const postage = kind === "node" && truthy(raw.knobs.postage_stamp);
  const shape = kind === "node" ? nodeShape(raw.className) : "rect";
  const sized = sizeOf(kind, shape, labelLines, measure, raw.knobs, postage);
  const x = numberKnob(raw.knobs.xpos) ?? 0;
  const y = numberKnob(raw.knobs.ypos) ?? 0;
  const color = parseTileColor(raw.knobs.tile_color) ?? classColor(raw.className);
  return {
    id: raw.id,
    className: raw.className,
    name: raw.name,
    knobs: raw.knobs,
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
    textColor: textColorFor(color),
    labelLines,
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
      to: inputAnchor(node, inputIndex),
    });
  });
  return pipes;
}

function pipeLabel(node: DagNode, index: number): string {
  const mainCount = node.inputs.length - node.maskInputs;
  if (index >= mainCount) return "mask";
  if (mainCount <= 1) return "";
  if (index === 0) return "B";
  if (index === 1) return "A";
  return `A${index}`;
}

function outputAnchor(node: DagNode): Anchor {
  if (node.kind === "dot") return { x: node.x + node.w / 2, y: node.y + node.h / 2, side: "center" };
  return { x: node.x + node.w / 2, y: node.bodyY + node.bodyH, side: "bottom" };
}

function inputAnchor(node: DagNode, index: number): Anchor {
  if (node.kind === "dot") return { x: node.x + node.w / 2, y: node.y + node.h / 2, side: "center" };
  const mainCount = node.inputs.length - node.maskInputs;
  if (index >= mainCount) {
    const maskCount = Math.max(1, node.maskInputs);
    const maskIndex = index - mainCount;
    const y =
      maskCount === 1
        ? node.bodyY + node.bodyH / 2
        : node.bodyY + 8 + maskIndex * 10;
    return { x: node.x + node.w, y, side: "right" };
  }
  const topCount = Math.min(mainCount, 4);
  if (topCount > 0 && index < topCount) {
    const slot = topCount - 1 - index;
    return {
      x: node.x + 8 + ((node.w - 16) * (slot + 0.5)) / topCount,
      y: node.bodyY,
      side: "top",
    };
  }
  return { x: node.x, y: node.bodyY + 8 + (index - 4) * 10, side: "left" };
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

function linesFor(raw: RawNode, kind: DagNode["kind"]): string[] {
  if (kind === "dot") return splitLines(raw.knobs.label);
  if (kind === "backdrop" || kind === "sticky") {
    return raw.knobs.label ? splitLines(raw.knobs.label) : [raw.name];
  }
  const lines = [raw.name, ...splitLines(raw.knobs.label)];
  const extra = autoLabel(raw);
  if (extra && !lines.includes(extra)) lines.push(extra);
  return lines;
}

function autoLabel(raw: RawNode): string | null {
  if (raw.className === "Read" || raw.className === "Write") {
    const file = raw.knobs.file?.replaceAll('"', "");
    if (!file) return null;
    const base = file.split("/").filter((part) => part.length > 0).at(-1);
    return base ?? null;
  }
  if (raw.className === "Merge2") return raw.knobs.operation || "over";
  if (raw.className === "Blur" && raw.knobs.size && /^-?\d+(?:\.\d+)?$/.test(raw.knobs.size.trim())) {
    return raw.knobs.size.trim();
  }
  if (raw.className === "Switch" && raw.knobs.which) return raw.knobs.which;
  if (raw.className === "FrameHold" && raw.knobs.first_frame) return raw.knobs.first_frame;
  if (raw.className === "TimeOffset" && raw.knobs.time_offset) return raw.knobs.time_offset;
  return null;
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
  const textWidth = lines.reduce((widest, line) => Math.max(widest, measure(line)), 0);
  const bodyH = lines.length <= 1 ? 18 : 18 + (lines.length - 1) * 12;
  const stamp = postage ? 46 : 0;
  if (shape === "circle") {
    const diameter = Math.max(52, bodyH, Math.ceil(textWidth + 10));
    return { w: diameter, h: diameter + stamp, bodyH: diameter, stamp };
  }
  const w = Math.max(80, Math.ceil(textWidth + 16));
  return { w, h: bodyH + stamp, bodyH, stamp };
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

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value.split("\n");
}

function numberKnob(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function truthy(value: string | undefined): boolean {
  return value === "true" || value === "1";
}
