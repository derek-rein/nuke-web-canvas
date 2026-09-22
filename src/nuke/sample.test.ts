import { expect, test } from "vitest";
import { parseNukeScript } from "./parse.ts";
import { buildScene } from "./scene.ts";
import { SAMPLE_SCRIPT } from "./sample.ts";

test("the sample script builds a recognizable comp", () => {
  const scene = buildScene(parseNukeScript(SAMPLE_SCRIPT), (line) => line.length * 6);
  const merge = scene.nodes.find((node) => node.name === "Merge1");
  const group = scene.nodes.find((node) => node.name === "grade_group");
  expect(merge?.inputs.filter((input) => input)).toHaveLength(3);
  expect(merge?.maskInputs).toBe(1);
  expect(group?.graph?.nodes.map((node) => node.name)).toEqual(["Input1", "Grade2", "Output1"]);
  expect(scene.nodes.some((node) => node.name === "Grade1Clone" && node.cloneOf)).toBe(true);
  expect(scene.pipes.length).toBeGreaterThan(4);
});
