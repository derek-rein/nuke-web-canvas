import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { NST_COMMIT, NST_REPO, gizmoInterior, nstCatalogUrl, nstGizmoUrl, nstRawUrl, type NstCatalog } from "./toolkit.ts";

test("toolkit graphs stay pinned to one commit", () => {
  expect(NST_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  expect(nstGizmoUrl("NST_Glow_Exponential.gizmo")).toBe(
    `https://raw.githubusercontent.com/CreativeLyons/NukeSurvivalToolkit_publicRelease/${NST_COMMIT}/NukeSurvivalToolkit/gizmos/NST_Glow_Exponential.gizmo`,
  );
});

test("gizmo interior drops the wrapper and keeps the inner nodes", () => {
  const source = `Group {
 name Glow
 addUserKnob {7 size}
 size 10
}
 Blur {
  name Blur1
  xpos 0
  ypos 40
 }
end_group
`;
  const interior = gizmoInterior(source);
  expect(interior).toContain("Blur {");
  expect(interior).not.toContain("end_group");
  expect(interior).not.toContain("name Glow");
});

test("the static catalog lists toolkit scripts and points at the pinned commit", () => {
  const catalog = JSON.parse(readFileSync(new URL("../../../public/nst/catalog.json", import.meta.url), "utf8")) as NstCatalog;
  expect(catalog.commit).toBe(NST_COMMIT);
  expect(catalog.repo).toBe(NST_REPO);
  expect(catalog.files.length).toBeGreaterThan(300);
  const glow = catalog.files.find((file) => file.name === "NST_Glow_Exponential");
  expect(glow?.kind).toBe("gizmo");
  expect(nstRawUrl(glow?.path ?? "")).toBe(
    `https://raw.githubusercontent.com/${NST_REPO}/${NST_COMMIT}/${glow?.path}`,
  );
  expect(nstCatalogUrl("/nuke-web-canvas/")).toBe("/nuke-web-canvas/nst/catalog.json");
  expect(catalog.files.some((file) => file.folder === "nk_files" && file.kind === "nk")).toBe(true);
});
