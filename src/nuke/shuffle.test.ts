import { expect, test } from "vitest";
import { parseMappings, shuffleModel } from "./shuffle.ts";

test("a default Shuffle routes each rgba channel to itself", () => {
  const model = shuffleModel("Shuffle", {});
  expect(model?.kind).toBe("classic");
  if (model?.kind !== "classic") return;
  expect(model.in1).toBe("rgba");
  expect(model.in2).toBe("none");
  expect(model.out2).toBe("none");
  expect(model.rows.map((row) => row.source)).toEqual(["red", "green", "blue", "alpha"]);
  expect(model.extra.map((row) => row.source)).toEqual(["red2", "green2", "blue2", "alpha2"]);
});

test("a Shuffle script can send alpha into red", () => {
  const model = shuffleModel("Shuffle", { red: "alpha", in: "rgba" });
  if (model?.kind !== "classic") throw new Error("classic");
  expect(model.rows[0]?.source).toBe("alpha");
});

test("Shuffle2 mappings are src and dst channel pairs", () => {
  const raw = "4 rgba.red 0 0 rgba.red 0 0 rgba.green 0 1 rgba.green 0 1 rgba.blue 0 2 rgba.blue 0 2 rgba.alpha 0 3 rgba.alpha 0 3";
  expect(parseMappings(raw)).toEqual([
    { src: "rgba.red", dst: "rgba.red" },
    { src: "rgba.green", dst: "rgba.green" },
    { src: "rgba.blue", dst: "rgba.blue" },
    { src: "rgba.alpha", dst: "rgba.alpha" },
  ]);
  const model = shuffleModel("Shuffle2", { fromInput1: "{0} B", mappings: raw, in2: "none" });
  if (model?.kind !== "links") throw new Error("links");
  expect(model.inInput).toBe("B");
  expect(model.inLayer).toBe("rgba");
  expect(model.out2Layer).toBe("none");
  expect(model.links).toHaveLength(4);
});
