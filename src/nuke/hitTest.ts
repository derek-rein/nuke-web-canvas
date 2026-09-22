import type { DagNode, DagScene } from "./scene.ts";

export function hitTest(scene: DagScene, dagX: number, dagY: number): DagNode | null {
  const nodes = [...scene.nodes].reverse();
  const order = [
    ...nodes.filter((node) => node.kind === "node" || node.kind === "dot"),
    ...nodes.filter((node) => node.kind === "sticky"),
    ...nodes.filter((node) => node.kind === "backdrop"),
  ];
  return order.find((node) => contains(node, dagX, dagY)) ?? null;
}

function contains(node: DagNode, dagX: number, dagY: number): boolean {
  if (node.shape === "circle" && node.kind === "node") {
    if (dagY < node.bodyY) {
      return dagX >= node.x && dagX <= node.x + node.w && dagY >= node.y;
    }
    const radius = Math.min(node.w, node.bodyH) / 2;
    const dx = dagX - (node.x + node.w / 2);
    const dy = dagY - (node.bodyY + node.bodyH / 2);
    return dx * dx + dy * dy <= radius * radius;
  }
  return dagX >= node.x && dagX <= node.x + node.w && dagY >= node.y && dagY <= node.y + node.h;
}
