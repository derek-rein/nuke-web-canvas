import type { KnobMap, ParsedScript, RawNode } from "./types.ts";

const GROUP_CLASSES = new Set(["Group", "Gizmo", "LiveGroup", "VariableGroup"]);
const SKIP_STACK = new Set(["BackdropNode", "StickyNote", "Root", "LiveGroupInfo"]);

type Frame = {
  parent: RawNode;
  stack: (RawNode | null)[];
  nameCounts: Map<string, number>;
};

class Scanner {
  i = 0;

  constructor(readonly source: string) {}

  eof(): boolean {
    return this.i >= this.source.length;
  }

  peek(): string {
    return this.source[this.i] ?? "";
  }

  skip(): void {
    while (!this.eof()) {
      const char = this.peek();
      if (char === " " || char === "\t" || char === "\r" || char === "\n") {
        this.i += 1;
        continue;
      }
      if (char === "#" && this.atLineStart()) {
        this.skipLine();
        continue;
      }
      break;
    }
  }

  skipHorizontal(): void {
    while (this.peek() === " " || this.peek() === "\t" || this.peek() === "\r") {
      this.i += 1;
    }
  }

  skipLine(): void {
    while (!this.eof() && this.peek() !== "\n") this.i += 1;
    if (this.peek() === "\n") this.i += 1;
  }

  readIdent(): string {
    const start = this.i;
    while (/[\w.]/.test(this.peek())) this.i += 1;
    return this.source.slice(start, this.i);
  }

  readInt(): number {
    const start = this.i;
    while (/\d/.test(this.peek())) this.i += 1;
    return Number(this.source.slice(start, this.i) || "0");
  }

  readRestOfLine(): string {
    const start = this.i;
    while (!this.eof() && this.peek() !== "\n") this.i += 1;
    const text = this.source.slice(start, this.i);
    if (this.peek() === "\n") this.i += 1;
    return text;
  }

  readBody(): KnobMap {
    if (this.peek() === "{") this.i += 1;
    const knobs: KnobMap = {};
    while (!this.eof()) {
      this.skip();
      if (this.peek() === "}") {
        this.i += 1;
        return knobs;
      }
      if (this.eof()) break;
      const key = this.readIdent();
      if (!key) {
        this.i += 1;
        continue;
      }
      this.skipHorizontal();
      knobs[key] = this.readValue();
    }
    throw new Error("Unclosed brace in Nuke script");
  }

  private atLineStart(): boolean {
    let cursor = this.i - 1;
    while (cursor >= 0 && (this.source[cursor] === " " || this.source[cursor] === "\t")) {
      cursor -= 1;
    }
    return cursor < 0 || this.source[cursor] === "\n";
  }

  private readValue(): string {
    const char = this.peek();
    if (char === "\n" || char === "" || char === "}") return "";
    if (char === '"') return decodeQuoted(this.readQuoted());
    if (char === "{") return this.readBraceGroup();
    return this.readRestOfLine().trim();
  }

  private readQuoted(): string {
    this.i += 1;
    let value = "";
    while (!this.eof()) {
      const char = this.peek();
      if (char === "\\") {
        value += char + (this.source[this.i + 1] ?? "");
        this.i += 2;
        continue;
      }
      if (char === '"') {
        this.i += 1;
        break;
      }
      value += char;
      this.i += 1;
    }
    return value;
  }

  readBraceGroup(): string {
    const start = this.i;
    let depth = 0;
    while (!this.eof()) {
      const char = this.peek();
      if (char === '"') {
        this.readQuoted();
        continue;
      }
      this.i += 1;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    return this.source.slice(start, this.i);
  }
}

function emptyRoot(): RawNode {
  return {
    id: "root",
    className: "Root",
    name: "Root",
    knobs: {},
    inputs: [],
    maskInputs: 0,
    children: [],
    cloneOf: null,
  };
}

function inputSpec(knobs: KnobMap): { main: number; mask: number } {
  const raw = knobs.inputs;
  if (raw == null) return { main: 1, mask: 0 };
  const match = raw.trim().match(/^(\d+)(?:\+(\d+))?$/);
  if (!match) return { main: 1, mask: 0 };
  return { main: Number(match[1]), mask: Number(match[2] ?? 0) };
}

function nextName(frame: Frame, className: string): string {
  const count = (frame.nameCounts.get(className) ?? 0) + 1;
  frame.nameCounts.set(className, count);
  return `${className}${count}`;
}

function createNode(
  className: string,
  knobs: KnobMap,
  frame: Frame,
  cloneOf: string | null,
): RawNode {
  const name = knobs.name && knobs.name.length > 0 ? knobs.name : nextName(frame, className);
  return {
    id: `${frame.parent.id}/${name}`,
    className,
    name,
    knobs: { ...knobs, name },
    inputs: [],
    maskInputs: 0,
    children: [],
    cloneOf,
  };
}

function link(node: RawNode, frame: Frame): void {
  const spec = inputSpec(node.knobs);
  const total = spec.main + spec.mask;
  const inputs: (string | null)[] = [];
  for (let index = 0; index < total; index += 1) {
    const popped = frame.stack.length > 0 ? frame.stack.pop() : null;
    inputs.push(popped ? popped.id : null);
  }
  node.inputs = inputs;
  node.maskInputs = spec.mask;
  frame.parent.children.push(node);
  if (!SKIP_STACK.has(node.className)) frame.stack.push(node);
}

function decodeQuoted(value: string): string {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && index + 1 < value.length) {
      const next = value[index + 1];
      if (next === "n") {
        decoded += "\n";
        index += 1;
        continue;
      }
      if (next === "\\" || next === '"') {
        decoded += next;
        index += 1;
        continue;
      }
    }
    decoded += value[index];
  }
  return decoded;
}

function readStackIndex(scanner: Scanner, frame: Frame, vars: Map<string, RawNode | null>): void {
  scanner.skipHorizontal();
  const name = scanner.readIdent();
  scanner.skip();
  if (scanner.peek() === "[") scanner.i += 1;
  scanner.skip();
  scanner.readIdent();
  scanner.skipHorizontal();
  const slot = scanner.readInt();
  scanner.skipHorizontal();
  if (scanner.peek() === "]") scanner.i += 1;
  const index = frame.stack.length - 1 - slot;
  vars.set(name, index >= 0 && index < frame.stack.length ? frame.stack[index] ?? null : null);
}

function pushToken(scanner: Scanner, frame: Frame, vars: Map<string, RawNode | null>): void {
  scanner.skipHorizontal();
  if (scanner.peek() === "0" && !/\w/.test(scanner.source[scanner.i + 1] ?? "")) {
    scanner.i += 1;
    frame.stack.push(null);
    return;
  }
  if (scanner.peek() === "$") {
    scanner.i += 1;
    const name = scanner.readIdent();
    frame.stack.push(vars.get(name) ?? null);
    return;
  }
  scanner.skipLine();
}

export function parseNukeScript(source: string): ParsedScript {
  const root = emptyRoot();
  const frames: Frame[] = [{ parent: root, stack: [], nameCounts: new Map() }];
  const vars = new Map<string, RawNode | null>();
  let version: string | null = null;
  const scanner = new Scanner(source);

  const frame = (): Frame => frames[frames.length - 1] ?? frames[0]!;

  while (!scanner.eof()) {
    scanner.skip();
    if (scanner.eof()) break;
    const ident = scanner.readIdent();
    if (!ident) {
      scanner.skipLine();
      continue;
    }
    if (ident === "version") {
      version = scanner.readRestOfLine().trim();
      continue;
    }
    if (ident === "set") {
      readStackIndex(scanner, frame(), vars);
      continue;
    }
    if (ident === "push") {
      pushToken(scanner, frame(), vars);
      continue;
    }
    if (ident === "end_group") {
      if (frames.length > 1) frames.pop();
      continue;
    }
    if (ident === "clone") {
      scanner.skip();
      if (scanner.peek() === "$") scanner.i += 1;
      const sourceName = scanner.readIdent();
      scanner.skip();
      if (scanner.peek() !== "{") {
        scanner.skipLine();
        continue;
      }
      const sourceNode = vars.get(sourceName) ?? null;
      const knobs = { ...(sourceNode?.knobs ?? {}), ...scanner.readBody() };
      const current = frame();
      const node = createNode(sourceNode?.className ?? "NoOp", knobs, current, sourceNode?.id ?? null);
      link(node, current);
      if (GROUP_CLASSES.has(node.className)) {
        frames.push({ parent: node, stack: [], nameCounts: new Map() });
      }
      continue;
    }

    scanner.skipHorizontal();
    if (scanner.peek() === "{") {
      if (ident === "define_window_layout_xml") {
        scanner.readBraceGroup();
        continue;
      }
      const knobs = scanner.readBody();
      if (ident === "Root" || ident === "LiveGroupInfo") {
        continue;
      }
      const current = frame();
      const node = createNode(ident, knobs, current, null);
      link(node, current);
      if (GROUP_CLASSES.has(ident)) {
        frames.push({ parent: node, stack: [], nameCounts: new Map() });
      }
      continue;
    }
    scanner.skipLine();
  }

  return { version, root };
}
