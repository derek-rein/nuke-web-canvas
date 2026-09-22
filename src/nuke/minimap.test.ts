import { expect, test } from "vitest";
import { minimapFrame, needsMinimap, viewRect } from "./minimap.ts";

test("viewRect is the camera window in DAG pixels", () => {
  expect(viewRect({ x: 10, y: 20, zoom: 2 }, 400, 200)).toEqual({ x: 10, y: 20, w: 200, h: 100 });
});

test("the minimap hides when the graph sits inside the view", () => {
  const bounds = { x: 0, y: 0, w: 100, h: 50 };
  const view = { x: -10, y: -10, w: 130, h: 80 };
  expect(needsMinimap(bounds, view)).toBe(false);
  expect(needsMinimap(bounds, { x: 0, y: 0, w: 90, h: 50 })).toBe(true);
});

test("minimapFrame fits the wider axis inside the padded map", () => {
  const frame = minimapFrame({ x: 0, y: 0, w: 200, h: 50 }, { w: 180, h: 120 }, 8);
  expect(frame.scale).toBeCloseTo((180 - 16) / 200);
  expect(frame.width).toBe(180);
  expect(frame.height).toBe(120);
});
