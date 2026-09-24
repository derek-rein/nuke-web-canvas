// Locked to this commit of Tony Lyons' Nuke Survival Toolkit.
// The gizmo text is loaded from that snapshot, not stored in this repo.
export const NST_COMMIT = "b6ebfa3e88fb8cd00d02bd3f5e74b83da2978d9e";

const RAW = `https://raw.githubusercontent.com/CreativeLyons/NukeSurvivalToolkit_publicRelease/${NST_COMMIT}/NukeSurvivalToolkit/gizmos`;

export function nstGizmoUrl(file: string): string {
  return `${RAW}/${file}`;
}

export const NST_REPO = "CreativeLyons/NukeSurvivalToolkit_publicRelease";

export type NstFile = {
  path: string;
  name: string;
  kind: "gizmo" | "nk";
  folder: "gizmos" | "nk_files";
};

export type NstCatalog = {
  commit: string;
  repo: string;
  files: NstFile[];
};

/** Same-origin index. GitHub Pages can serve this without calling the GitHub API. */
export function nstCatalogUrl(base: string = import.meta.env.BASE_URL): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}nst/catalog.json`;
}

export function nstRawUrl(path: string): string {
  return `https://raw.githubusercontent.com/${NST_REPO}/${NST_COMMIT}/${path}`;
}

export async function loadNstCatalog(): Promise<NstCatalog> {
  const response = await fetch(nstCatalogUrl());
  if (!response.ok) throw new Error(`Could not load the toolkit index (${response.status})`);
  return (await response.json()) as NstCatalog;
}

export async function loadNstFile(path: string): Promise<string> {
  const response = await fetch(nstRawUrl(path));
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.text();
}

export async function loadNstGraph(file: string): Promise<string> {
  const response = await fetch(nstGizmoUrl(file));
  if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
  return gizmoInterior(await response.text());
}

/** The nodes inside a Group or Gizmo, so the canvas shows the tool instead of one closed node. */
export function gizmoInterior(source: string): string {
  const match = /(?:^|\n)(Group|Gizmo)\s*\{/.exec(source);
  if (!match || match.index == null) return source;
  const brace = source.indexOf("{", match.index);
  let depth = 0;
  let index = brace;
  let inString = false;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (inString) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        index += 1;
        break;
      }
    }
    index += 1;
  }
  let rest = source.slice(index);
  const end = rest.lastIndexOf("end_group");
  if (end >= 0) rest = rest.slice(0, end);
  return `version 15.0 v1\n${rest.trim()}\n`;
}
