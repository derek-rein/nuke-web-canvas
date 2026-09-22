import { expect, test } from "vitest";
import { nodeShape } from "./shapes.ts";

test("Nuke class names map to the DAG outline from node_shape", () => {
  expect(nodeShape("Blur")).toBe("rect");
  expect(nodeShape("ScanlineRender")).toBe("rect");
  expect(nodeShape("Camera3")).toBe("circle");
  expect(nodeShape("Light2")).toBe("circle");
  expect(nodeShape("Scene")).toBe("circle");
  expect(nodeShape("GeoCamera")).toBe("circle");
  expect(nodeShape("GeoCard")).toBe("pill");
  expect(nodeShape("ReadGeo2")).toBe("pill");
  expect(nodeShape("DeepMerge")).toBe("deep");
  expect(nodeShape("DeepRead")).toBe("deep");
  expect(nodeShape("BasicMaterial")).toBe("point");
  expect(nodeShape("Viewer")).toBe("point");
  expect(nodeShape("Group")).toBe("point");
  expect(nodeShape("Gizmo")).toBe("point");
  expect(nodeShape("Input")).toBe("input");
  expect(nodeShape("Output")).toBe("output");
  expect(nodeShape("ParticleEmitter")).toBe("particle");
});
