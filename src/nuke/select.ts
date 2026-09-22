import type { DagNode, DagScene } from "./scene.ts";

type DagRect = { x: number; y: number; w: number; h: number };

export function nodesInRect(scene: DagScene, rect: DagRect): DagNode[] {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return scene.nodes.filter((node) => overlaps(node.x, node.y, node.w, node.h, rect.x, rect.y, right, bottom));
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function upstreamIds(scene: DagScene, id: string): string[] {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const result: string[] = [];
  const seen = new Set<string>();
  const walk = (current: string): void => {
    if (seen.has(current)) return;
    seen.add(current);
    result.push(current);
    const node = byId.get(current);
    if (!node) return;
    for (const input of node.inputs) {
      if (input) walk(input);
    }
  };
  walk(id);
  return result;
}

export function neighborId(scene: DagScene, id: string, direction: "up" | "down"): string | null {
  if (direction === "up") {
    const node = scene.nodes.find((item) => item.id === id);
    const input = node?.inputs.find((item): item is string => item != null);
    return input ?? null;
  }
  return scene.pipes.find((pipe) => pipe.fromId === id)?.toId ?? null;
}

export function selectionBounds(nodes: readonly DagNode[]): DagRect | null {
  if (nodes.length === 0) return null;
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
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function overlaps(
  x: number,
  y: number,
  w: number,
  h: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  return x <= right && x + w >= left && y <= bottom && y + h >= top;
}
