import { expect, test } from "vitest";
import { shouldUseWebGPU } from "./canvas2d.ts";

test("desktop Chrome with WebGPU stays on the GPU path", () => {
  expect(
    shouldUseWebGPU({
      gpu: {},
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0",
      maxTouchPoints: 0,
    }),
  ).toBe(true);
});

test("a missing GPU adapter uses canvas 2D", () => {
  expect(shouldUseWebGPU({ userAgent: "Mozilla/5.0 Chrome/140.0.0.0" })).toBe(false);
});

test("iPhone uses canvas 2D even when WebGPU is advertised", () => {
  expect(
    shouldUseWebGPU({
      gpu: {},
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    }),
  ).toBe(false);
});

test("iPadOS desktop UA with touch uses canvas 2D", () => {
  expect(
    shouldUseWebGPU({
      gpu: {},
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    }),
  ).toBe(false);
});
