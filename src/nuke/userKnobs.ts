import { knobKind, startsNewLine, type KnobKind } from "./knobTypes.ts";

export type UserKnob = {
  type: number;
  kind: KnobKind;
  name: string;
  label: string;
  tooltip: string;
  menu: string[];
  link: string;
  min: number | null;
  max: number | null;
  startLine: boolean;
  hidden: boolean;
};

export function parseAddUserKnob(raw: string): UserKnob | null {
  const tokens = tokenize(stripOuter(raw.trim()));
  const type = Number(tokens[0]);
  if (!Number.isInteger(type)) return null;
  const name = unquote(tokens[1] ?? "");
  const kind = knobKind(type);
  let label = "";
  let tooltip = "";
  let link = "";
  let menu: string[] = [];
  let min: number | null = null;
  let max: number | null = null;
  let start: boolean | null = null;
  let hidden = false;
  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (/^[+-][A-Za-z_]/.test(token)) {
      const on = token.startsWith("+");
      const flag = token.slice(1);
      if (flag === "STARTLINE") start = on;
      if (flag === "HIDDEN" || flag === "INVISIBLE") hidden = on || hidden;
      continue;
    }
    const next = tokens[index + 1];
    if (token === "l" && next != null) {
      label = unquote(next);
      index += 1;
      continue;
    }
    if (token === "t" && next != null) {
      tooltip = unquote(next);
      index += 1;
      continue;
    }
    if (token === "T" && next != null) {
      link = unquote(next);
      index += 1;
      continue;
    }
    if (token === "M" && next != null) {
      menu = menuItems(next);
      index += 1;
      continue;
    }
    if (token === "R" && next != null && tokens[index + 2] != null) {
      min = Number(next);
      max = Number(tokens[index + 2]);
      index += 2;
    }
  }
  return {
    type,
    kind,
    name,
    label: label || name,
    tooltip,
    menu,
    link,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    startLine: startsNewLine(kind, start),
    hidden,
  };
}

function stripOuter(value: string): string {
  if (value.startsWith("{") && value.endsWith("}")) return value.slice(1, -1).trim();
  return value;
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      tokens.push(source.slice(start, index));
      continue;
    }
    if (char === "{") {
      const start = index;
      let depth = 0;
      while (index < source.length) {
        const current = source[index];
        if (current === '"') {
          index += 1;
          while (index < source.length && source[index] !== '"') {
            index += source[index] === "\\" ? 2 : 1;
          }
          index += 1;
          continue;
        }
        index += 1;
        if (current === "{") depth += 1;
        if (current === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      tokens.push(source.slice(start, index));
      continue;
    }
    const start = index;
    while (index < source.length && !/\s/.test(source[index] ?? "")) index += 1;
    tokens.push(source.slice(start, index));
  }
  return tokens;
}

function unquote(token: string): string {
  if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
    return token
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return token;
}

function menuItems(token: string): string[] {
  return tokenize(stripOuter(token)).map(unquote);
}
