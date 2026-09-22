export type GroupKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export function isEnterGroupKey(event: GroupKeyEvent): boolean {
  if (event.key !== "Enter") return false;
  if (event.altKey || event.shiftKey) return false;
  return event.ctrlKey || event.metaKey;
}

export function isLeaveGroupKey(event: GroupKeyEvent): boolean {
  return event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

export function enterGroupPath(
  path: readonly string[],
  node: { id: string; graph: unknown } | null,
): string[] | null {
  if (!node?.graph) return null;
  return [...path, node.id];
}

export function leaveGroupPath(path: readonly string[]): string[] {
  return path.slice(0, -1);
}
