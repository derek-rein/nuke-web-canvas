import { expect, test } from "vitest";
import { enterGroupPath, isEnterGroupKey, isLeaveGroupKey, leaveGroupPath } from "./navigate.ts";

const plain = { key: "Enter", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

test("ctrl+enter and cmd+return open a group, plain enter does not", () => {
  expect(isEnterGroupKey({ ...plain, ctrlKey: true })).toBe(true);
  expect(isEnterGroupKey({ ...plain, metaKey: true })).toBe(true);
  expect(isEnterGroupKey(plain)).toBe(false);
  expect(isEnterGroupKey({ ...plain, ctrlKey: true, shiftKey: true })).toBe(false);
  expect(isEnterGroupKey({ ...plain, ctrlKey: true, altKey: true })).toBe(false);
  expect(isEnterGroupKey({ ...plain, key: "f", ctrlKey: true })).toBe(false);
});

test("escape steps out of a group and modified escape does not", () => {
  expect(isLeaveGroupKey({ ...plain, key: "Escape" })).toBe(true);
  expect(isLeaveGroupKey({ ...plain, key: "Escape", shiftKey: true })).toBe(false);
  expect(isLeaveGroupKey(plain)).toBe(false);
});

test("entering appends a group that has a subgraph and leaving pops one level", () => {
  expect(enterGroupPath(["root"], { id: "root/Tool", graph: {} })).toEqual(["root", "root/Tool"]);
  expect(enterGroupPath(["root"], { id: "root/Grade1", graph: null })).toBeNull();
  expect(enterGroupPath([], null)).toBeNull();
  expect(leaveGroupPath(["root", "root/Tool", "root/Tool/Inner"])).toEqual(["root", "root/Tool"]);
  expect(leaveGroupPath([])).toEqual([]);
});
