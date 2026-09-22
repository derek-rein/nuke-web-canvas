import { classHasMask } from "../nuke/catalog.ts";
import { channelIndicators } from "../nuke/channels.ts";
import {
  labelLineHeight,
  noteFontSize,
  pipeSamples,
  type Anchor,
  type DagNode,
  type DagScene,
} from "../nuke/scene.ts";
import type { Camera, NukeRenderer } from "./renderer.ts";

const BG = "#3c3c3c";
const PIPE_DOWN = "#e6ae51";
const PIPE_OTHER = "#000000";
const SELECT = "#fa9900";
const DOT_SELECT = "#fcba63";
const INPUT_LABEL = "#fcba63";
const CLONE_BADGE = "#e07020";
const EXPRESSION_LINK = "#71c973";
const CLONE_LINK = "#e87830";
const TEXT_ZOOM = 0.28;

export type GpuProbe = {
  gpu?: unknown;
  userAgent?: string;
  maxTouchPoints?: number;
};

/** iPhone/iPad WebGPU still drops this shader path. Draw with canvas 2D there. */
export function shouldUseWebGPU(probe: GpuProbe = globalProbe()): boolean {
  if (!probe.gpu) return false;
  const ua = probe.userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return false;
  if (/Mac/i.test(ua) && (probe.maxTouchPoints ?? 0) > 1) return false;
  return true;
}

export function createCanvas2DRenderer(canvas: HTMLCanvasElement): NukeRenderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a 2D canvas");
  let scene: DagScene | null = null;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let selected = new Set<string>();
  let cssWidth = 1;
  let cssHeight = 1;
  let dpr = 1;

  return {
    resize(width, height, nextDpr) {
      cssWidth = Math.max(1, width);
      cssHeight = Math.max(1, height);
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
      canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    },
    setScene(next) {
      scene = next;
    },
    setCamera(next) {
      camera = next;
    },
    setSelected(ids) {
      selected = new Set(ids);
    },
    draw() {
      if (!scene) return;
      paintScene(ctx, scene, camera, selected, cssWidth, cssHeight, dpr);
    },
    destroy() {},
  };
}

export function paintScene(
  ctx: CanvasRenderingContext2D,
  scene: DagScene,
  camera: Camera,
  selected: ReadonlySet<string>,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvasWidth(ctx, cssWidth, dpr), canvasHeight(ctx, cssHeight, dpr));
  const scale = camera.zoom * dpr;
  ctx.setTransform(scale, 0, 0, scale, -camera.x * scale, -camera.y * scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const notes = scene.nodes
    .filter((node) => node.kind === "backdrop" || node.kind === "sticky")
    .slice()
    .sort((a, b) => a.z - b.z);
  for (const node of notes) {
    if (node.kind === "backdrop") paintBackdrop(ctx, node);
    else paintSticky(ctx, node);
  }

  const outputConnected = connectedOutputs(scene);
  for (const node of scene.nodes) {
    if (node.hideInput || node.kind === "backdrop" || node.kind === "sticky") continue;
    for (const pipe of scene.pipes) {
      if (pipe.toId !== node.id) continue;
      paintPipe(ctx, pipe.from, pipe.to, node.className === "Viewer");
    }
  }
  paintLinks(ctx, scene);

  for (const node of scene.nodes) {
    if (node.kind === "backdrop" || node.kind === "sticky") continue;
    if (selected.has(node.id) && camera.zoom >= TEXT_ZOOM) paintLabelBacking(ctx, node);
    paintNode(ctx, node, outputConnected.has(node.id), selected.has(node.id));
  }

  if (camera.zoom >= TEXT_ZOOM) {
    for (const node of scene.nodes) paintLabel(ctx, node);
    for (const node of scene.nodes) {
      if (node.hideInput || node.kind === "backdrop" || node.kind === "sticky") continue;
      for (const pipe of scene.pipes) {
        if (pipe.toId === node.id) paintPipeLabel(ctx, pipe);
      }
    }
  }

  for (const node of scene.nodes) {
    if (selected.has(node.id)) paintSelection(ctx, node);
  }
}

function canvasWidth(ctx: CanvasRenderingContext2D, cssWidth: number, dpr: number): number {
  return ctx.canvas.width || Math.max(1, Math.floor(cssWidth * dpr));
}

function canvasHeight(ctx: CanvasRenderingContext2D, cssHeight: number, dpr: number): number {
  return ctx.canvas.height || Math.max(1, Math.floor(cssHeight * dpr));
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

function paintBackdrop(ctx: CanvasRenderingContext2D, node: DagNode): void {
  ctx.fillStyle = css(node.color);
  ctx.fillRect(node.x, node.y, node.w, node.h);
  const lift = css([
    Math.min(1, node.color[0] + 0.08),
    Math.min(1, node.color[1] + 0.08),
    Math.min(1, node.color[2] + 0.08),
    node.color[3],
  ]);
  const cut = Math.min(12, node.w / 4, node.h / 4);
  ctx.fillStyle = lift;
  triangle(ctx, node.x, node.y, node.x + cut, node.y, node.x, node.y + cut);
  triangle(ctx, node.x + node.w, node.y, node.x + node.w - cut, node.y, node.x + node.w, node.y + cut);
  triangle(ctx, node.x, node.y + node.h, node.x + cut, node.y + node.h, node.x, node.y + node.h - cut);
  triangle(ctx, node.x + node.w, node.y + node.h, node.x + node.w - cut, node.y + node.h, node.x + node.w, node.y + node.h - cut);
  const inset = Math.min(6, node.w / 5);
  const barH = Math.min(18, Math.max(8, node.h - 8));
  ctx.fillRect(node.x + inset, node.y + 2, Math.max(0, node.w - inset * 2), barH);
}

function paintSticky(ctx: CanvasRenderingContext2D, node: DagNode): void {
  ctx.fillStyle = "rgb(38, 38, 38)";
  roundRect(ctx, node.x - 1, node.y - 1, node.w + 2, node.h + 2, 7);
  ctx.fill();
  ctx.fillStyle = css(node.color);
  roundRect(ctx, node.x, node.y, node.w, node.h, 6);
  ctx.fill();
}

function paintNode(ctx: CanvasRenderingContext2D, node: DagNode, outputConnected: boolean, selected: boolean): void {
  if (node.kind === "dot") {
    paintDot(ctx, node, selected);
    if (!outputConnected) {
      const x = node.x + node.w / 2;
      arrow(ctx, x, node.y + node.h - 1, x, node.y + node.h + 8, "#000", 8, 4.5);
    }
    return;
  }
  if (node.postage) {
    ctx.fillStyle = "#1f1f1f";
    roundRect(ctx, node.x, node.y, node.w, 46, 2);
    ctx.fill();
  }
  paintBody(ctx, node);
  paintChannels(ctx, node);
  paintPorts(ctx, node, outputConnected);
  if (node.cloneOf && node.kind === "node") paintClone(ctx, node);
  if (node.disabled) paintCross(ctx, node);
}

function paintDot(ctx: CanvasRenderingContext2D, node: DagNode, selected: boolean): void {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const radius = node.w / 2 - 0.6;
  const gradient = ctx.createLinearGradient(cx, node.y, cx, node.y + node.h);
  gradient.addColorStop(0, shadeCss(node.color, 1.2));
  gradient.addColorStop(1, shadeCss(node.color, 0.64));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  if (!selected) return;
  ctx.fillStyle = DOT_SELECT;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.64, 0, Math.PI * 2);
  ctx.fill();
}

function paintBody(ctx: CanvasRenderingContext2D, node: DagNode): void {
  const x = node.x;
  const y = node.bodyY;
  const gradient = ctx.createLinearGradient(x, y, x, y + node.bodyH);
  gradient.addColorStop(0, css(node.color));
  gradient.addColorStop(1, shadeCss(node.color, 0.76));
  ctx.fillStyle = gradient;
  bodyPath(ctx, node);
  ctx.fill();
}

function bodyPath(ctx: CanvasRenderingContext2D, node: DagNode): void {
  const x = node.x;
  const y = node.bodyY;
  const w = node.w;
  const h = node.bodyH;
  const r = Math.min(w, h) / 2;
  if (node.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return;
  }
  if (node.shape === "pill") {
    roundRect(ctx, x, y, w, h, r);
    return;
  }
  if (node.shape === "deep") {
    const slant = h * 0.45;
    ctx.beginPath();
    ctx.moveTo(x + slant, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    return;
  }
  if (node.shape === "point") {
    const inset = Math.min(h * 0.5, w * 0.45);
    ctx.beginPath();
    ctx.moveTo(x + inset, y);
    ctx.lineTo(x + w - inset, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - inset, y + h);
    ctx.lineTo(x + inset, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    return;
  }
  if (node.shape === "particle") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    return;
  }
  if (node.shape === "input" || node.shape === "output") {
    const inset = Math.min(h, w * 0.85);
    const top = node.shape === "input" ? 0 : inset;
    const bot = node.shape === "input" ? inset : 0;
    ctx.beginPath();
    ctx.moveTo(x + top, y);
    ctx.lineTo(x + w - top, y);
    ctx.lineTo(x + w - bot, y + h);
    ctx.lineTo(x + bot, y + h);
    ctx.closePath();
    return;
  }
  roundRect(ctx, x, y, w, h, 2);
}

function paintChannels(ctx: CanvasRenderingContext2D, node: DagNode): void {
  const channels = channelIndicators(node.className, node.knobs);
  if (channels.length === 0) return;
  const width = 4;
  const height = 3;
  const gap = 1;
  const total = channels.length * width + (channels.length - 1) * gap;
  const left = node.x + (node.w - total) / 2;
  const top = node.bodyY + node.bodyH - height - 1;
  for (const [index, color] of channels.entries()) {
    ctx.fillStyle = css(color);
    ctx.fillRect(left + index * (width + gap), top, width, height);
  }
}

function paintPorts(ctx: CanvasRenderingContext2D, node: DagNode, outputConnected: boolean): void {
  if (node.kind !== "node" || node.className === "Viewer") return;
  if (!outputConnected) {
    const x = node.x + node.w / 2;
    const y = node.bodyY + node.bodyH;
    arrow(ctx, x, y - 1, x, y + 8, "#000", 8, 4.5);
  }
  if (node.hideInput || maskConnected(node)) return;
  if (node.maskInputs <= 0 && !classHasMask(node.className)) return;
  const midY = node.bodyY + node.bodyH / 2;
  const edge = node.x + node.w;
  arrow(ctx, edge + 7, midY, edge - 1, midY, "#000", 7, 3.5);
}

function maskConnected(node: DagNode): boolean {
  if (node.maskInputs <= 0) return false;
  const mainCount = node.inputs.length - node.maskInputs;
  return node.inputs.slice(mainCount).some((id) => id != null);
}

function paintClone(ctx: CanvasRenderingContext2D, node: DagNode): void {
  const cx = node.x;
  const cy = node.bodyY + node.bodyH / 2;
  ctx.fillStyle = CLONE_BADGE;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "12px Verdana, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("C", cx, cy + 0.5);
}

function paintCross(ctx: CanvasRenderingContext2D, node: DagNode): void {
  const inset = 3;
  ctx.strokeStyle = "rgb(230, 38, 38)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(node.x + inset, node.bodyY + inset);
  ctx.lineTo(node.x + node.w - inset, node.bodyY + node.bodyH - inset);
  ctx.moveTo(node.x + node.w - inset, node.bodyY + inset);
  ctx.lineTo(node.x + inset, node.bodyY + node.bodyH - inset);
  ctx.stroke();
}

function paintPipe(ctx: CanvasRenderingContext2D, from: Anchor, to: Anchor, dotted: boolean): void {
  const samples = pipeSamples(from, to, 20);
  if (to.side === "center") pullInside(samples, samples.length - 1, 6);
  if (from.side === "center") pullInside(samples, 0, 6);
  const color = Math.abs(to.x - from.x) < to.y - from.y ? PIPE_DOWN : PIPE_OTHER;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dotted ? [3, 3] : []);
  ctx.beginPath();
  samples.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  if (last && prev) arrow(ctx, prev.x, prev.y, last.x, last.y, color, 12, 4);
}

function paintLinks(ctx: CanvasRenderingContext2D, scene: DagScene): void {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const link of scene.links) {
    const source = byId.get(link.fromId);
    const target = byId.get(link.toId);
    if (!source || !target) continue;
    const from = { x: source.x + source.w / 2, y: source.bodyY + source.bodyH / 2 };
    const to = { x: target.x + target.w / 2, y: target.bodyY + target.bodyH / 2 };
    ctx.strokeStyle = link.kind === "expression" ? EXPRESSION_LINK : CLONE_LINK;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function paintLabelBacking(ctx: CanvasRenderingContext2D, node: DagNode): void {
  if (node.kind !== "node" || node.labelLines.length === 0) return;
  const fontSize = noteFontSize(node.kind, node.knobs);
  const lineHeight = labelLineHeight(fontSize);
  ctx.font = `${fontSize}px Verdana, sans-serif`;
  let widest = 0;
  for (const line of node.labelLines) widest = Math.max(widest, ctx.measureText(line).width);
  const pad = 2;
  const w = widest + pad * 2;
  const h = node.labelLines.length * lineHeight + pad * 2;
  if (w <= node.w && h <= node.bodyH) return;
  ctx.fillStyle = css([node.color[0], node.color[1], node.color[2], 0.6]);
  ctx.fillRect(node.x + node.w / 2 - w / 2, node.bodyY + node.bodyH / 2 - h / 2, w, h);
}

function paintLabel(ctx: CanvasRenderingContext2D, node: DagNode): void {
  if (node.labelLines.length === 0) return;
  const fontSize = noteFontSize(node.kind, node.knobs);
  const lineHeight = labelLineHeight(fontSize);
  const blockHeight = node.labelLines.length * lineHeight;
  const headerH = Math.min(18, Math.max(8, node.h - 8));
  const originY =
    node.kind === "dot"
      ? node.y + node.h / 2 - blockHeight / 2
      : node.kind === "backdrop"
        ? node.y + 2 + headerH / 2 - blockHeight / 2
        : node.kind === "sticky"
          ? node.y + node.h / 2 - blockHeight / 2
          : node.bodyY + node.bodyH / 2 - blockHeight / 2;
  ctx.font = `${fontSize}px Verdana, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = node.kind === "dot" ? "rgb(219, 219, 219)" : css(node.textColor);
  node.labelLines.forEach((line, index) => {
    ctx.textAlign = node.kind === "dot" ? "left" : "center";
    const x = node.kind === "dot" ? node.x + node.w + 6 : node.x + node.w / 2;
    ctx.fillText(line, x, originY + index * lineHeight + fontSize);
  });
}

function paintPipeLabel(ctx: CanvasRenderingContext2D, pipe: DagScene["pipes"][number]): void {
  if (!pipe.label) return;
  ctx.font = "10px Verdana, sans-serif";
  ctx.fillStyle = INPUT_LABEL;
  ctx.textBaseline = "middle";
  let x = pipe.to.x;
  let y = pipe.to.y;
  if (pipe.to.side === "top") {
    ctx.textAlign = "center";
    y -= 16;
  } else if (pipe.to.side === "right") {
    ctx.textAlign = "left";
    x += 6;
    y -= 12;
  } else if (pipe.to.side === "left") {
    ctx.textAlign = "right";
    x -= 6;
    y -= 12;
  } else if (pipe.to.side === "bottom") {
    ctx.textAlign = "center";
    y += 16;
  } else {
    return;
  }
  ctx.fillText(pipe.label, x, y);
}

function paintSelection(ctx: CanvasRenderingContext2D, node: DagNode): void {
  if (node.kind === "dot") return;
  ctx.strokeStyle = SELECT;
  ctx.lineWidth = 2;
  roundRect(ctx, node.x - 3, node.bodyY - 3, node.w + 6, node.bodyH + 6, 2);
  ctx.stroke();
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
  samples[index] = outward
    ? { x: point.x + (dx / length) * shift, y: point.y + (dy / length) * shift }
    : { x: point.x - (dx / length) * shift, y: point.y - (dy / length) * shift };
}

function arrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  size: number,
  halfWidth: number,
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = toX - ux * size;
  const baseY = toY - uy * size;
  ctx.fillStyle = color;
  triangle(ctx, toX, toY, baseX - uy * halfWidth, baseY + ux * halfWidth, baseX + uy * halfWidth, baseY - ux * halfWidth);
}

function triangle(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function css(color: readonly [number, number, number, number]): string {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgba(${channel(color[0])}, ${channel(color[1])}, ${channel(color[2])}, ${color[3]})`;
}

function shadeCss(color: readonly [number, number, number, number], shade: number): string {
  return css([
    Math.min(1, color[0] * shade),
    Math.min(1, color[1] * shade),
    Math.min(1, color[2] * shade),
    color[3],
  ]);
}

function globalProbe(): GpuProbe {
  if (typeof navigator === "undefined") return {};
  return {
    gpu: navigator.gpu,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}
