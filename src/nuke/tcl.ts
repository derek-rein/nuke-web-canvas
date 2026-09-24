export type TclScope = {
  frame: number;
  /** Node whose knobs `this` and bare names refer to. */
  label: string;
  knobs: Record<string, string>;
  /** Other nodes in the same group, including this one. */
  nodes: ReadonlyMap<string, Record<string, string>>;
  /** Project format, used by `width`, `height`, and `input.width`. */
  width: number;
  height: number;
  parent?: TclScope;
};

const PYTHON_PLACEHOLDER = "python";
const FAILED = "tcl";

export function selfScope(knobs: Record<string, string>, frame = 1, label = "", width = 1920, height = 1080): TclScope {
  return { frame, label, knobs, nodes: new Map([[label, knobs]]), width, height };
}

/** Substitutes `[...]` TCL in a label or other displayed string. */
export function renderText(text: string, scope: TclScope): string {
  return substitute(unescapeScript(text), scope, new Set(), 0);
}

/**
 * The value to show for a knob. Literals stay as stored. TCL expressions and
 * curves are evaluated. `[python ...]` becomes a placeholder.
 */
export function renderKnob(raw: string, scope: TclScope): string {
  if (!raw) return raw;
  const text = unescapeScript(raw);
  if (!isExpressionValue(text) && !text.includes("[")) return text;
  try {
    if (isExpressionValue(text)) return evalExpressionValue(text, scope, new Set(), 0);
    return substitute(stripOne(text), scope, new Set(), 0);
  } catch {
    return FAILED;
  }
}

function evalExpressionValue(raw: string, scope: TclScope, stack: Set<string>, depth: number): string {
  const groups = expressionGroups(raw);
  if (!groups) return substitute(raw, scope, stack, depth);
  return groups.map((group) => evalComponent(unwrap(group), scope, stack, depth)).join(" ");
}

function evalComponent(body: string, scope: TclScope, stack: Set<string>, depth: number): string {
  const text = body.trim();
  if (text === "curve" || text.startsWith("curve ") || text.startsWith("curve\t")) return sampleCurve(text, scope.frame);
  const quoted = wholeQuoted(text);
  if (quoted != null) {
    const substituted = substitute(quoted, scope, stack, depth);
    try {
      return evalExpr(substituted, scope, stack, depth);
    } catch {
      return substituted;
    }
  }
  if (text.includes("[")) return substitute(text, scope, stack, depth);
  return evalExpr(text, scope, stack, depth);
}

function isExpressionValue(raw: string): boolean {
  const groups = expressionGroups(raw);
  if (!groups || groups.length === 0) return false;
  return groups.some((group) => isExprComponent(unwrap(group)));
}

/** One outer `{...}` in a .nk file can hold several per-channel expressions. */
function expressionGroups(raw: string): string[] | null {
  const groups = topGroups(raw.trim());
  if (!groups) return null;
  if (groups.length === 1) {
    const nested = topGroups((groups[0] ?? "").trim());
    if (nested && nested.length > 1) return nested;
  }
  return groups;
}

function wholeQuoted(text: string): string | null {
  if (text.length < 2 || text[0] !== '"') return null;
  let value = "";
  for (let index = 1; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (char === "\\") {
      value += text[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (char === '"') return index === text.length - 1 ? value : null;
    value += char;
  }
  return null;
}

function unescapeScript(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && index + 1 < value.length) {
      const next = value[index + 1] ?? "";
      if (next === "[" || next === "]" || next === "{" || next === "}" || next === "$" || next === "\\") {
        out += next;
        index += 1;
        continue;
      }
    }
    out += value[index];
  }
  return out;
}

function isExprComponent(text: string): boolean {
  const body = text.trim();
  if (!body) return false;
  if (body === "curve" || body.startsWith("curve ") || body.startsWith("curve\t")) return true;
  if (body.includes("[")) return true;
  if (/^[A-Za-z_][\w]*\(/.test(body)) return true;
  if (/[*/%<>=?:!]/.test(body) || /[+\-].*[+\-A-Za-z\d]/.test(body)) {
    return !/^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?)*$/.test(body);
  }
  if (/^[A-Za-z_][\w.]*$/.test(body)) return body === "frame" || body === "x" || body === "y" || body === "t" || body.includes(".");
  return false;
}

function unwrap(group: string): string {
  const trimmed = group.trim();
  const nested = topGroups(trimmed);
  if (nested && nested.length === 1 && trimmed.startsWith("{")) return nested[0] ?? trimmed;
  return trimmed;
}

function topGroups(text: string): string[] | null {
  if (!text.startsWith("{")) return null;
  const groups: string[] = [];
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
    if (index >= text.length) break;
    if (text[index] !== "{") return null;
    const end = matchBrace(text, index);
    if (end < 0) return null;
    groups.push(text.slice(index + 1, end));
    index = end + 1;
  }
  return groups.length > 0 ? groups : null;
}

function substitute(text: string, scope: TclScope, stack: Set<string>, depth: number): string {
  if (depth > 32) return FAILED;
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "[") {
      out += text[index];
      continue;
    }
    const end = matchBracket(text, index);
    if (end < 0) {
      out += text[index];
      continue;
    }
    try {
      out += evalCommand(text.slice(index + 1, end), scope, stack, depth + 1);
    } catch {
      out += FAILED;
    }
    index = end;
  }
  return out;
}

function evalCommand(body: string, scope: TclScope, stack: Set<string>, depth: number): string {
  const words = splitWords(body, scope, stack, depth);
  const command = words[0] ?? "";
  const args = words.slice(1);
  if (command === "python") return PYTHON_PLACEHOLDER;
  if (command === "value" || command === "knob") {
    const path = knobPath(args);
    if (command === "knob") {
      const raw = readPath(path, scope);
      return raw === undefined ? `[knob ${path}]` : raw;
    }
    const resolved = resolvePath(path, scope, stack, depth);
    return resolved === undefined ? `[value ${args.join(" ")}]` : presentLiteral(resolved);
  }
  if (command === "expr") return evalExpr(args.join(" "), scope, stack, depth);
  if (command === "if") return evalIf(args, scope, stack, depth);
  if (command === "return") return args.join(" ");
  if (command === "frame") return String(scope.frame);
  if (command === "string") return evalString(args);
  if (command === "format") return evalFormat(args);
  return FAILED;
}

function evalIf(args: string[], scope: TclScope, stack: Set<string>, depth: number): string {
  const cond = evalExpr(args[0] ?? "0", scope, stack, depth);
  const truth = isTruthy(cond);
  let branch = args[1] ?? "";
  if (!truth) {
    const marker = args[2];
    branch = marker === "else" || marker === "elseif" ? (args[3] ?? "") : (marker ?? "");
  }
  return evalScript(branch, scope, stack, depth);
}

function evalScript(script: string, scope: TclScope, stack: Set<string>, depth: number): string {
  const trimmed = script.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) return substitute(trimmed, scope, stack, depth);
  if (/^(return|expr|value|knob|if|python|string|format|frame)\b/.test(trimmed)) {
    return evalCommand(trimmed, scope, stack, depth);
  }
  return substitute(trimmed, scope, stack, depth);
}

function evalString(args: string[]): string {
  const op = args[0] ?? "";
  const text = args[1] ?? "";
  if (op === "equal") return text === (args[2] ?? "") ? "1" : "0";
  if (op === "length") return String(text.length);
  if (op === "tolower") return text.toLowerCase();
  if (op === "toupper") return text.toUpperCase();
  return FAILED;
}

function evalFormat(args: string[]): string {
  let index = 1;
  return (args[0] ?? "").replace(/%[sdgf]/g, (token) => {
    const arg = args[index++] ?? "";
    if (token === "%d") return String(Math.trunc(Number(arg) || 0));
    if (token === "%f" || token === "%g") {
      const number = Number(arg);
      return Number.isFinite(number) ? formatNumber(number) : arg;
    }
    return arg;
  });
}

type Value = { kind: "num"; n: number } | { kind: "str"; s: string };

function evalExpr(text: string, scope: TclScope, stack: Set<string>, depth: number): string {
  const parser = new Parser(text, scope, stack, depth);
  const value = parser.parseTernary();
  parser.skip();
  if (!parser.done()) throw new Error("trailing expression");
  return present(value);
}

function present(value: Value): string {
  if (value.kind === "str") return value.s;
  return formatNumber(value.n);
}

function isTruthy(text: string): boolean {
  const number = Number(text);
  if (text.trim() !== "" && Number.isFinite(number)) return number !== 0;
  const lower = text.trim().toLowerCase();
  return lower !== "" && lower !== "false";
}

class Parser {
  private index = 0;

  constructor(
    private readonly text: string,
    private readonly scope: TclScope,
    private readonly stack: Set<string>,
    private readonly depth: number,
  ) {}

  done(): boolean {
    return this.index >= this.text.length;
  }

  parseTernary(): Value {
    const cond = this.parseOr();
    this.skip();
    if (this.peek() !== "?") return cond;
    this.index += 1;
    const yes = this.parseTernary();
    this.skip();
    if (this.peek() !== ":") throw new Error("missing else");
    this.index += 1;
    const no = this.parseTernary();
    return isTruthy(present(cond)) ? yes : no;
  }

  parseOr(): Value {
    let left = this.parseAnd();
    for (;;) {
      this.skip();
      if (!this.eat("||")) return left;
      const right = this.parseAnd();
      left = { kind: "num", n: isTruthy(present(left)) || isTruthy(present(right)) ? 1 : 0 };
    }
  }

  parseAnd(): Value {
    let left = this.parseCmp();
    for (;;) {
      this.skip();
      if (!this.eat("&&")) return left;
      const right = this.parseCmp();
      left = { kind: "num", n: isTruthy(present(left)) && isTruthy(present(right)) ? 1 : 0 };
    }
  }

  parseCmp(): Value {
    let left = this.parseAdd();
    for (;;) {
      this.skip();
      const op = this.eatOne(["==", "!=", "<=", ">=", "<", ">"]);
      if (!op) return left;
      const right = this.parseAdd();
      left = { kind: "num", n: compare(left, right, op) ? 1 : 0 };
    }
  }

  parseAdd(): Value {
    let left = this.parseMul();
    for (;;) {
      this.skip();
      if (this.peek() !== "+" && this.peek() !== "-") return left;
      const op = this.peek();
      this.index += 1;
      const right = this.parseMul();
      const value = op === "+" ? asNum(left) + asNum(right) : asNum(left) - asNum(right);
      left = { kind: "num", n: value };
    }
  }

  parseMul(): Value {
    let left = this.parseUnary();
    for (;;) {
      this.skip();
      const op = this.eatOne(["*", "/", "%"]);
      if (!op) return left;
      const right = this.parseUnary();
      const a = asNum(left);
      const b = asNum(right);
      if ((op === "/" || op === "%") && b === 0) throw new Error("division by zero");
      const value = op === "*" ? a * b : op === "/" ? a / b : a % b;
      left = { kind: "num", n: value };
    }
  }

  parseUnary(): Value {
    this.skip();
    if (this.eat("!")) return { kind: "num", n: isTruthy(present(this.parseUnary())) ? 0 : 1 };
    if (this.eat("-")) return { kind: "num", n: -asNum(this.parseUnary()) };
    if (this.eat("+")) return this.parseUnary();
    return this.parsePrimary();
  }

  parsePrimary(): Value {
    this.skip();
    const char = this.peek();
    if (char === "(") {
      this.index += 1;
      const value = this.parseTernary();
      this.skip();
      if (this.peek() !== ")") throw new Error("missing )");
      this.index += 1;
      return value;
    }
    if (char === "[") {
      const end = matchBracket(this.text, this.index);
      if (end < 0) throw new Error("unclosed command");
      const result = evalCommand(this.text.slice(this.index + 1, end), this.scope, this.stack, this.depth + 1);
      this.index = end + 1;
      const number = Number(result);
      return result.trim() !== "" && Number.isFinite(number) ? { kind: "num", n: number } : { kind: "str", s: result };
    }
    if (char === '"') return { kind: "str", s: this.readQuoted() };
    if (char === "{") {
      const end = matchBrace(this.text, this.index);
      if (end < 0) throw new Error("unclosed brace");
      const inner = this.text.slice(this.index + 1, end);
      this.index = end + 1;
      return { kind: "str", s: inner };
    }
    if (char === "$") return this.readVariable();
    if (isNumberStart(char, this.text[this.index + 1] ?? "")) return { kind: "num", n: this.readNumber() };
    return this.readNamed();
  }

  skip(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index] ?? "")) this.index += 1;
  }

  peek(): string {
    return this.text[this.index] ?? "";
  }

  eat(token: string): boolean {
    if (this.text.startsWith(token, this.index)) {
      this.index += token.length;
      return true;
    }
    return false;
  }

  eatOne(tokens: string[]): string | null {
    for (const token of tokens) {
      if (this.eat(token)) return token;
    }
    return null;
  }

  readQuoted(): string {
    this.index += 1;
    let value = "";
    while (this.index < this.text.length) {
      const char = this.peek();
      if (char === "\\") {
        value += this.text[this.index + 1] ?? "";
        this.index += 2;
        continue;
      }
      if (char === '"') {
        this.index += 1;
        break;
      }
      if (char === "[") {
        const end = matchBracket(this.text, this.index);
        if (end < 0) break;
        value += evalCommand(this.text.slice(this.index + 1, end), this.scope, this.stack, this.depth + 1);
        this.index = end + 1;
        continue;
      }
      value += char;
      this.index += 1;
    }
    return value;
  }

  readVariable(): Value {
    this.index += 1;
    let name = "";
    if (this.peek() === "{") {
      const end = matchBrace(this.text, this.index);
      name = this.text.slice(this.index + 1, end < 0 ? this.text.length : end);
      this.index = end < 0 ? this.text.length : end + 1;
    } else {
      while (this.index < this.text.length && /[\w.]/.test(this.peek())) {
        name += this.peek();
        this.index += 1;
      }
    }
    const resolved = resolvePath(name, this.scope, this.stack, this.depth);
    if (resolved === undefined) throw new Error(`missing ${name}`);
    const number = Number(resolved);
    return resolved.trim() !== "" && Number.isFinite(number) ? { kind: "num", n: number } : { kind: "str", s: resolved };
  }

  readNumber(): number {
    const start = this.index;
    if (this.peek() === "-" || this.peek() === "+") this.index += 1;
    while (this.index < this.text.length && /[\d.]/.test(this.peek())) this.index += 1;
    const number = Number(this.text.slice(start, this.index));
    if (!Number.isFinite(number)) throw new Error("bad number");
    return number;
  }

  readNamed(): Value {
    const start = this.index;
    while (this.index < this.text.length && /[\w.]/.test(this.peek())) this.index += 1;
    const name = this.text.slice(start, this.index);
    if (!name) throw new Error("expected value");
    this.skip();
    if (this.peek() === "(") {
      this.index += 1;
      const args: number[] = [];
      this.skip();
      if (this.peek() !== ")") {
        for (;;) {
          args.push(asNum(this.parseTernary()));
          this.skip();
          if (this.peek() === ",") {
            this.index += 1;
            continue;
          }
          break;
        }
      }
      if (this.peek() !== ")") throw new Error("missing )");
      this.index += 1;
      return { kind: "num", n: callFunction(name, args) };
    }
    const resolved = resolvePath(name, this.scope, this.stack, this.depth);
    if (resolved === undefined) throw new Error(`missing ${name}`);
    if (isExpressionValue(resolved) || resolved.includes("[")) {
      const rendered = isExpressionValue(resolved)
        ? evalExpressionValue(resolved, this.scope, this.stack, this.depth + 1)
        : substitute(stripOne(resolved), this.scope, this.stack, this.depth + 1);
      const number = Number(rendered);
      return rendered.trim() !== "" && Number.isFinite(number) ? { kind: "num", n: number } : { kind: "str", s: rendered };
    }
    const literal = presentLiteral(resolved);
    const number = Number(literal);
    return literal.trim() !== "" && Number.isFinite(number) && /^-?\d/.test(literal.trim())
      ? { kind: "num", n: number }
      : { kind: "str", s: literal };
  }
}

function compare(left: Value, right: Value, op: string): boolean {
  const leftNum = Number(present(left));
  const rightNum = Number(present(right));
  const numeric = present(left).trim() !== "" && present(right).trim() !== "" && Number.isFinite(leftNum) && Number.isFinite(rightNum);
  if (op === "==") return numeric ? leftNum === rightNum : present(left) === present(right);
  if (op === "!=") return numeric ? leftNum !== rightNum : present(left) !== present(right);
  const a = numeric ? leftNum : Number.NaN;
  const b = numeric ? rightNum : Number.NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === "<") return a < b;
  if (op === ">") return a > b;
  if (op === "<=") return a <= b;
  if (op === ">=") return a >= b;
  return false;
}

function asNum(value: Value): number {
  if (value.kind === "num") return value.n;
  const number = Number(value.s);
  if (!Number.isFinite(number)) throw new Error(`not a number: ${value.s}`);
  return number;
}

function callFunction(name: string, args: number[]): number {
  const a = args[0] ?? 0;
  const b = args[1] ?? 0;
  const c = args[2] ?? 0;
  if (name === "abs") return Math.abs(a);
  if (name === "sin") return Math.sin(a);
  if (name === "cos") return Math.cos(a);
  if (name === "tan") return Math.tan(a);
  if (name === "sqrt") return Math.sqrt(a);
  if (name === "log") return Math.log(a);
  if (name === "exp") return Math.exp(a);
  if (name === "floor") return Math.floor(a);
  if (name === "ceil") return Math.ceil(a);
  if (name === "round") return Math.round(a);
  if (name === "int") return Math.trunc(a);
  if (name === "min") return Math.min(...args);
  if (name === "max") return Math.max(...args);
  if (name === "pow") return a ** b;
  if (name === "hypot") return Math.hypot(a, b);
  if (name === "clamp") return Math.min(Math.max(a, b), c);
  if (name === "inrange") return a >= b && a <= c ? 1 : 0;
  throw new Error(`unknown function ${name}`);
}

function resolvePath(path: string, scope: TclScope, stack: Set<string>, depth: number): string | undefined {
  if (!path) return undefined;
  const id = `${scope.label}:${path}`;
  if (stack.has(id)) return undefined;
  stack.add(id);
  try {
    const raw = readPath(path, scope);
    if (raw === undefined) return undefined;
    if (!isExpressionValue(raw) && !raw.includes("[")) return raw;
    return isExpressionValue(raw) ? evalExpressionValue(raw, scope, stack, depth + 1) : substitute(stripOne(raw), scope, stack, depth + 1);
  } finally {
    stack.delete(id);
  }
}

function knobPath(args: string[]): string {
  const head = args[0] ?? "";
  const second = args[1];
  if (second != null && !/^-?\d+(?:\.\d+)?$/.test(second)) return `${head}.${second}`;
  return head;
}

function readPath(path: string, scope: TclScope): string | undefined {
  if (path === "frame" || path === "t") return String(scope.frame);
  if (path === "width" || path === "format.w" || /^input\d*\.width$/.test(path)) return String(scope.width);
  if (path === "height" || path === "format.h" || /^input\d*\.height$/.test(path)) return String(scope.height);
  const parts = path.split(".").filter((part) => part.length > 0);
  if (parts[0] === "this") parts.shift();
  if (parts[0] === "parent" && scope.parent) {
    parts.shift();
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return readKnob(scope.parent.knobs, parts[0] ?? "");
    const nodeKnobs = scope.parent.nodes.get(parts[0] ?? "");
    if (!nodeKnobs) return readKnob(scope.parent.knobs, parts.join("."));
    return readKnob(nodeKnobs, parts.slice(1).join("."));
  }
  const head = parts[0] ?? "";
  const foreign = scope.nodes.get(head);
  if (foreign && parts.length >= 2) return readKnob(foreign, parts.slice(1).join("."));
  return readKnob(scope.knobs, parts.join("."));
}

function readKnob(knobs: Record<string, string>, path: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(knobs, path)) return knobs[path];
  const parts = path.split(".");
  if (parts.length < 2) return undefined;
  const channel = channelIndex(parts[parts.length - 1] ?? "");
  if (channel == null) return undefined;
  const raw = knobs[parts.slice(0, -1).join(".")];
  if (raw == null) return undefined;
  const pieces = stripOne(raw).trim().split(/\s+/);
  return pieces[channel];
}

function channelIndex(name: string): number | null {
  if (name === "x" || name === "r" || name === "u" || name === "w" || name === "0") return 0;
  if (name === "y" || name === "g" || name === "v" || name === "h" || name === "1") return 1;
  if (name === "z" || name === "b" || name === "2") return 2;
  if (name === "a" || name === "3") return 3;
  return null;
}

function presentLiteral(value: string): string {
  const trimmed = value.trim();
  const groups = topGroups(trimmed);
  if (groups && groups.length === 1 && !isExprComponent(unwrap(groups[0] ?? ""))) return groups[0] ?? trimmed;
  return trimmed;
}

function splitWords(body: string, scope: TclScope, stack: Set<string>, depth: number): string[] {
  const words: string[] = [];
  let index = 0;
  while (index < body.length) {
    while (index < body.length && /\s/.test(body[index] ?? "")) index += 1;
    if (index >= body.length) break;
    const char = body[index] ?? "";
    if (char === "{") {
      const end = matchBrace(body, index);
      if (end < 0) break;
      words.push(body.slice(index + 1, end));
      index = end + 1;
      continue;
    }
    if (char === '"') {
      const parsed = new Parser(body.slice(index), scope, stack, depth).readQuoted();
      words.push(parsed);
      index += quotedLength(body, index);
      continue;
    }
    if (char === "[") {
      const end = matchBracket(body, index);
      if (end < 0) break;
      words.push(evalCommand(body.slice(index + 1, end), scope, stack, depth + 1));
      index = end + 1;
      continue;
    }
    let word = "";
    while (index < body.length && !/\s/.test(body[index] ?? "")) {
      if (body[index] === "[") {
        const end = matchBracket(body, index);
        if (end < 0) break;
        word += evalCommand(body.slice(index + 1, end), scope, stack, depth + 1);
        index = end + 1;
        continue;
      }
      word += body[index];
      index += 1;
    }
    words.push(word);
  }
  return words;
}

function quotedLength(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === '"') return index - start + 1;
    index += 1;
  }
  return text.length - start;
}

function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchBracket(text: string, open: number): number {
  let depth = 0;
  let brace = 0;
  let quote = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\" && quote) {
      index += 1;
      continue;
    }
    if (char === '"' && brace === 0) quote = !quote;
    if (quote) continue;
    if (char === "{") brace += 1;
    if (char === "}" && brace > 0) brace -= 1;
    if (brace > 0) continue;
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function sampleCurve(body: string, frame: number): string {
  const tokens = body.trim().split(/\s+/);
  const keys: Array<[number, number]> = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (!/^x-?\d+(?:\.\d+)?$/.test(token)) continue;
    const x = Number(token.slice(1));
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    keys.push([x, y]);
    index += 1;
  }
  if (keys.length === 0) return "0";
  keys.sort((a, b) => a[0] - b[0]);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return "0";
  if (frame <= first[0]) return formatNumber(first[1]);
  if (frame >= last[0]) return formatNumber(last[1]);
  for (let index = 0; index < keys.length - 1; index += 1) {
    const a = keys[index];
    const b = keys[index + 1];
    if (!a || !b || frame < a[0] || frame > b[0]) continue;
    const span = b[0] - a[0] || 1;
    return formatNumber(a[1] + ((b[1] - a[1]) * (frame - a[0])) / span);
  }
  return formatNumber(last[1]);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return FAILED;
  if (Object.is(value, -0)) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function stripOne(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}") && matchBrace(trimmed, 0) === trimmed.length - 1) {
    return trimmed.slice(1, -1);
  }
  return value;
}

function isNumberStart(char: string, next: string): boolean {
  if (/[\d.]/.test(char)) return true;
  return (char === "-" || char === "+") && /[\d.]/.test(next);
}
