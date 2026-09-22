import { expect, test } from "vitest";
import { dragZoom, fitCamera, panCamera, wheelZoom, zoomAbout } from "./view.ts";

const camera = { x: 100, y: 50, zoom: 2 };

test("zoom stays fixed on the point under the cursor", () => {
  const next = zoomAbout(camera, 40, 20, 4);
  const beforeX = camera.x + 40 / camera.zoom;
  const beforeY = camera.y + 20 / camera.zoom;
  expect(next.x + 40 / next.zoom).toBeCloseTo(beforeX);
  expect(next.y + 20 / next.zoom).toBeCloseTo(beforeY);
  expect(next.zoom).toBe(4);
});

test("the wheel zooms about the cursor", () => {
  const next = wheelZoom(camera, 10, 30, 100);
  expect(next.zoom).toBeLessThan(camera.zoom);
  expect(next.x + 10 / next.zoom).toBeCloseTo(camera.x + 10 / camera.zoom);
});

test("dragging right with alt and the middle button zooms in", () => {
  const next = dragZoom(camera, 20, 20, 200);
  expect(next.zoom).toBeGreaterThan(camera.zoom);
  expect(dragZoom(camera, 20, 20, -200).zoom).toBeLessThan(camera.zoom);
});

test("panning moves the graph with the pointer", () => {
  const next = panCamera(camera, 20, -10);
  expect(next.zoom).toBe(camera.zoom);
  expect(next.x).toBeCloseTo(camera.x - 20 / camera.zoom);
  expect(next.y).toBeCloseTo(camera.y + 10 / camera.zoom);
});

test("fit frames the given nodes inside the panel", () => {
  const next = fitCamera({ x: 0, y: 0, w: 100, h: 50 }, 800, 400);
  expect(next.zoom).toBeGreaterThan(1);
  expect(next.zoom).toBeLessThanOrEqual(4);
  const viewW = 800 / next.zoom;
  const viewH = 400 / next.zoom;
  expect(next.x).toBeLessThan(0);
  expect(next.x + viewW).toBeGreaterThan(100);
  expect(next.y).toBeLessThan(0);
  expect(next.y + viewH).toBeGreaterThan(50);
});
