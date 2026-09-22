import { expect, test } from "vitest";
import { channelIndicators, colorsForChannels } from "./channels.ts";

test("3d nodes have no channel indicators unless the script sets channels", () => {
  expect(channelIndicators("Camera3", {})).toEqual([]);
  expect(channelIndicators("Light2", {})).toEqual([]);
  expect(channelIndicators("Scene", {})).toEqual([]);
  expect(channelIndicators("GeoCard", {})).toEqual([]);
  expect(channelIndicators("Camera3", { channels: "rgba" })).toHaveLength(4);
});

test("omitted channels use the class default", () => {
  expect(channelIndicators("Blur", {})).toHaveLength(4);
  expect(channelIndicators("Grade", {})).toHaveLength(3);
  expect(channelIndicators("Constant", {})).toHaveLength(3);
  expect(channelIndicators("Copy", {})).toEqual([]);
  expect(channelIndicators("Erode", {})).toHaveLength(1);
});

test("a channels knob in the script replaces the default", () => {
  expect(channelIndicators("Blur", { channels: "rgb" })).toHaveLength(3);
  expect(channelIndicators("Grade", { channels: "alpha" })).toHaveLength(1);
  expect(colorsForChannels("none")).toEqual([]);
  expect(channelIndicators("Transform", {})).toEqual([]);
});
