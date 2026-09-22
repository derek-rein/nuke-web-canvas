import { expect, test } from "vitest";
import { replacementScript } from "./paste.ts";

test("paste replaces the script instead of appending", () => {
  const existing = "Grade {\n name Grade1\n}\n";
  const incoming = "Blur {\n name Blur1\n}\n";
  expect(replacementScript(incoming)).toBe(incoming);
  expect(replacementScript(incoming)).not.toContain(existing);
});

test("a blank paste is ignored", () => {
  expect(replacementScript("  \n\t")).toBeNull();
  expect(replacementScript("")).toBeNull();
});

test("windows newlines become line feeds and a bom is dropped", () => {
  expect(replacementScript("\uFEFFGrade {\r\n name Grade1\r\n}\r\n")).toBe("Grade {\n name Grade1\n}\n");
});
