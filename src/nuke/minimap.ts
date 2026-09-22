import type { DagNode } from "./scene.ts";

export const MINIMAP_WIDTH = 180;
export const MINIMAP_HEIGHT = 120;

export type Rect = { x: number; y: number; w: number; h: number };

export type MinimapCamera = { x: number; y: number; zoom: number };

export type MinimapFrame = {
  scale: number;
  /** CSS pixel where DAG x = 0 lands. Point p maps to origin + p * scale. */
  originX: number;
  /** CSS pixel where DAG y = 0 lands. */
  originY: number;
  width: number;
  height: number;
};

export function viewRect(camera: MinimapCamera, cssWidth: number, cssHeight: number): Rect {
  return {
    x: camera.x,
    y: camera.y,
    w: cssWidth / camera.zoom,
    h: cssHeight / camera.zoom,
  };
}

export function needsMinimap(bounds: Rect, view: Rect, slack = 8): boolean {
  return (
    bounds.x < view.x - slack ||
    bounds.y < view.y - slack ||
    bounds.x + bounds.w > view.x + view.w + slack ||
    bounds.y + bounds.h > view.y + view.h + slack
  );
}

export function minimapFrame(
  bounds: Rect,
  size: { w: number; h: number } = { w: MINIMAP_WIDTH, h: MINIMAP_HEIGHT },
  pad = 8,
): MinimapFrame {
  const innerW = size.w - pad * 2;
  const innerH = size.h - pad * 2;
  if (!(bounds.w > 0) || !(bounds.h > 0) || !(innerW > 0) || !(innerH > 0)) {
    return { scale: 1, originX: pad - bounds.x, originY: pad - bounds.y, width: size.w, height: size.h };
  }
  const scale = Math.min(innerW / bounds.w, innerH / bounds.h);
  const contentW = bounds.w * scale;
  const contentH = bounds.h * scale;
  return {
    scale,
    originX: pad + (innerW - contentW) / 2 - bounds.x * scale,
    originY: pad + (innerH - contentH) / 2 - bounds.y * scale,
    width: size.w,
    height: size.h,
  };
}

export function minimapToDag(frame: MinimapFrame, localX: number, localY: number): { x: number; y: number } {
  return {
    x: (localX - frame.originX) / frame.scale,
    y: (localY - frame.originY) / frame.scale,
  };
}

/** Keep the grabbed DAG point on the cursor. The view rect follows the drag. */
export function panWithMinimap(
  camera: MinimapCamera,
  from: { x: number; y: number },
  to: { x: number; y: number },
): MinimapCamera {
  return {
    x: camera.x + (to.x - from.x),
    y: camera.y + (to.y - from.y),
    zoom: camera.zoom,
  };
}

export function paintMinimap(
  canvas: HTMLCanvasElement,
  nodes: readonly DagNode[],
  bounds: Rect,
  camera: MinimapCamera,
  cssWidth: number,
  cssHeight: number,
): void {
  const frame = minimapFrame(bounds);
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const pixelW = Math.max(1, Math.round(frame.width * dpr));
  const pixelH = Math.max(1, Math.round(frame.height * dpr));
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, frame.width, frame.height);
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, frame.width, frame.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(1, 1, frame.width - 2, frame.height - 2);
  ctx.clip();
  for (const node of notesFirst(nodes)) {
    ctx.fillStyle = rgbaCss(node.color);
    const at = dagToMinimap(frame, node.x, node.y);
    ctx.fillRect(at.x, at.y, node.w * frame.scale, node.h * frame.scale);
  }
  const view = viewRect(camera, cssWidth, cssHeight);
  const at = dagToMinimap(frame, view.x, view.y);
  ctx.fillStyle = "rgba(186, 140, 140, 0.45)";
  ctx.fillRect(at.x, at.y, view.w * frame.scale, view.h * frame.scale);
  ctx.strokeStyle = "#f0d0d0";
  ctx.lineWidth = 1;
  ctx.strokeRect(at.x, at.y, view.w * frame.scale, view.h * frame.scale);
  ctx.restore();

  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, frame.width - 1, frame.height - 1);
}

function dagToMinimap(frame: MinimapFrame, x: number, y: number): { x: number; y: number } {
  return { x: frame.originX + x * frame.scale, y: frame.originY + y * frame.scale };
}

function notesFirst(nodes: readonly DagNode[]): DagNode[] {
  const notes = nodes
    .filter((node) => node.kind === "backdrop" || node.kind === "sticky")
    .slice()
    .sort((a, b) => a.z - b.z);
  const rest = nodes.filter((node) => node.kind !== "backdrop" && node.kind !== "sticky");
  return notes.concat(rest);
}

function rgbaCss(color: readonly [number, number, number, number]): string {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgba(${channel(color[0])}, ${channel(color[1])}, ${channel(color[2])}, ${color[3]})`;
}
