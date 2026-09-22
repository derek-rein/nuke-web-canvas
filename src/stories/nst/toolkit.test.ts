import { expect, test } from "vitest";
import { NST_COMMIT, gizmoInterior, nstGizmoUrl } from "./toolkit.ts";

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
