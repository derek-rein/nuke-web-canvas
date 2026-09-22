import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("scaffold", () => {
  it("registers the TypeGPU vite plugin and the NukeDag component file", () => {
    const vite = readFileSync("vite.config.ts", "utf8");
    const dag = readFileSync("src/NukeDag.tsx", "utf8");
    expect(vite).toContain("unplugin-typegpu");
    expect(vite).toContain("@vitejs/plugin-react");
    expect(dag).toContain("export function NukeDag");
  });
});
