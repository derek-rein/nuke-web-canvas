import type { KnobKind } from "./knobTypes.ts";
import { KNOB_SCHEMAS, type KnobRow } from "./knobSchemas.ts";
import type { DagNode } from "./scene.ts";
import { renderKnob, type TclScope } from "./tcl.ts";
import { primatteModel, type PrimatteModel } from "./primatte.ts";
import { isShuffleKnob, shuffleModel, type ShuffleModel } from "./shuffle.ts";
import type { UserKnob } from "./userKnobs.ts";

export type ChannelMask = { r: boolean; g: boolean; b: boolean; a: boolean };

export type PropertyControl = {
  id: string;
  name: string;
  kind: KnobKind;
  label: string;
  tooltip: string;
  value: string;
  options: string[];
  optionLabels: string[];
  min: number | null;
  max: number | null;
  checked: boolean;
  channels: ChannelMask;
  secret: boolean;
  startLine: boolean;
};

export type PropertyTab = { id: string; name: string; controls: PropertyControl[] };

export type PropertyPanel = {
  name: string;
  className: string;
  color: string;
  tabs: PropertyTab[];
  shuffle: ShuffleModel | null;
  primatte: PrimatteModel | null;
};

type KnobSpec = {
  name: string;
  kind: KnobKind;
  label: string;
  tooltip: string;
  menu: string[];
  optionLabels: string[];
  link: string;
  min: number | null;
  max: number | null;
  startLine: boolean;
  hidden: boolean;
  defaultValue: string;
};

const LAYOUT_KNOBS = new Set([
  "name",
  "xpos",
  "ypos",
  "selected",
  "inputs",
  "hide_input",
  "disable",
  "postage_stamp",
  "postage_stamp_frame",
  "tile_color",
  "gl_color",
  "note_font",
  "note_font_size",
  "note_font_color",
  "label",
  "z_order",
  "icon",
  "cached",
  "bookmark",
  "dope_sheet",
  "help",
  "knobChanged",
  "onCreate",
  "onDestroy",
  "updateUI",
  "autolabel",
  "indicators",
  "panel",
  "rootNodeUpdated",
  "lifetimeStart",
  "lifetimeEnd",
  "useLifetime",
]);

const TAB_KINDS = new Set<KnobKind>(["tab", "tabGroup"]);

export function buildProperties(node: DagNode, scope?: TclScope): PropertyPanel {
  const schema = (KNOB_SCHEMAS[node.className] ?? []).map(rowToSpec);
  const custom = node.userKnobs.map(userSpec);
  const customByName = new Map<string, KnobSpec>();
  for (const knob of custom) {
    if (knob.name) customByName.set(knob.name, knob);
  }
  const emitted = new Set<string>();
  const classControls: PropertyControl[] = [];
  schema.forEach((knob, index) => {
    const override = knob.name ? customByName.get(knob.name) : undefined;
    if (override?.hidden) {
      if (knob.name) emitted.add(knob.name);
      return;
    }
    const shufflePlaceholder = (node.className === "Shuffle" || node.className === "Shuffle2") && knob.kind === "string" && knob.name.startsWith("panel_") && !knob.label;
    if (shufflePlaceholder || isShuffleKnob(node.className, knob.name)) {
      if (knob.name) emitted.add(knob.name);
      return;
    }
    const source = override ? { ...override, defaultValue: knob.defaultValue || override.defaultValue } : knob;
    const previous = classControls[classControls.length - 1];
    classControls.push(apply(node.knobs, panelLabel(source, previous), index, scope));
    if (knob.name) emitted.add(knob.name);
  });
  for (const [name, value] of Object.entries(node.knobs)) {
    if (emitted.has(name) || customByName.has(name) || LAYOUT_KNOBS.has(name) || isShuffleKnob(node.className, name)) continue;
    if (schema.some((knob) => knob.name === name)) continue;
    classControls.push(inferControl(name, value, classControls.length, scope));
    emitted.add(name);
  }
  const shuffle = shuffleModel(node.className, node.knobs);
  const primatte = primatteModel(node.className, node.knobs, scope?.width ?? 1920, scope?.height ?? 1080);
  const tabs = packTabs(tabTitle(node.className), classControls).filter((tab) => tab.controls.length > 0);
  if ((shuffle || primatte) && !tabs.some((tab) => tab.name === tabTitle(node.className))) {
    tabs.unshift({ id: "class", name: tabTitle(node.className), controls: [] });
  }
  const extras = custom.filter((knob) => !knob.hidden && !(knob.name && emitted.has(knob.name)));
  const customTabs: PropertyTab[] = [];
  appendCustom(customTabs, extras, node, scope);
  const nodeIndex = tabs.findIndex((tab) => tab.name.toLowerCase() === "node");
  if (nodeIndex >= 0) tabs.splice(nodeIndex, 0, ...customTabs);
  else {
    tabs.push(...customTabs);
    tabs.push(nodeTab(node, scope));
  }
  return {
    name: node.name,
    className: node.className,
    color: cssColor(node.color),
    tabs,
    shuffle,
    primatte,
  };
}

export function sliderFraction(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  const clamped = Math.min(max, Math.max(min, value));
  if (min === 0 && max >= 10) {
    const span = Math.log1p(max - min);
    return span === 0 ? 0 : Math.log1p(clamped - min) / span;
  }
  return (clamped - min) / (max - min);
}

export function sliderMarks(min: number, max: number): number[] {
  if (!(max > min)) return [min];
  if (min === 0 && max >= 10) {
    const wanted = [0, 1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const marks = wanted.filter((mark) => mark >= min && mark <= max);
    if (marks[0] !== min) marks.unshift(min);
    if (marks[marks.length - 1] !== max) marks.push(max);
    return marks;
  }
  const marks: number[] = [];
  for (let index = 0; index <= 10; index += 1) marks.push(min + ((max - min) * index) / 10);
  return marks;
}

export function sliderLabeled(mark: number, min: number, max: number): boolean {
  if (mark === min || mark === max) return true;
  if (min === 0 && max <= 1) return Math.abs(mark - (min + max) / 2) < 1e-6;
  if (min === 0 && max >= 10) return mark === 1 || mark === 10 || mark === 50;
  return true;
}

export function formatMark(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) >= 100 || Number.isInteger(value)) return String(Math.round(value));
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export type LookupCurve = { name: string; points: Array<[number, number]> };

/** Named curves stored as `sat {}` or `sat {curve x0 1 x3 1.5}`. */
export function parseLookupCurves(value: string): LookupCurve[] {
  const curves: LookupCurve[] = [];
  for (const match of value.matchAll(/([A-Za-z0-9_]+)\s*\{([^{}]*)\}/g)) {
    curves.push({ name: match[1] ?? "", points: lookupPoints(match[2] ?? "") });
  }
  return curves;
}

function lookupPoints(body: string): Array<[number, number]> {
  const text = body.trim();
  if (!text) return [];
  const keyed = text.match(/x\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/gi);
  if (keyed && keyed.length > 0) {
    return keyed.map((item) => {
      const nums = item.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      return [nums[0] ?? 0, nums[1] ?? 0];
    });
  }
  const nums = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: Array<[number, number]> = [];
  for (let index = 0; index + 1 < nums.length; index += 2) points.push([nums[index] ?? 0, nums[index + 1] ?? 0]);
  return points;
}

export function curvePoints(value: string): Array<[number, number]> {
  const body = /curve\s+([^}]*)/i.exec(value)?.[1] ?? "";
  const nums = body.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: Array<[number, number]> = [];
  for (let index = 0; index + 1 < nums.length; index += 2) {
    const x = nums[index];
    const y = nums[index + 1];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push([x, y]);
  }
  return points;
}

export function channelMask(value: string): ChannelMask {
  const text = value.trim().toLowerCase();
  if (text === "all" || text === "rgba" || text === "rgb.rgba") return { r: true, g: true, b: true, a: true };
  if (text === "rgb") return { r: true, g: true, b: true, a: false };
  if (text === "alpha" || text === "a" || text === "rgba.alpha") return { r: false, g: false, b: false, a: true };
  if (text === "none" || text === "-" || text === "") return { r: false, g: false, b: false, a: false };
  const part = text.split(".").pop() ?? text;
  return {
    r: part === "red" || part === "r",
    g: part === "green" || part === "g",
    b: part === "blue" || part === "b",
    a: part === "alpha" || part === "a",
  };
}

export function numericParts(value: string): string[] {
  const text = value.trim();
  const inner = text.startsWith("{") && text.endsWith("}") ? text.slice(1, -1).trim() : text;
  if (!inner) return [];
  const parts = inner.split(/\s+/);
  return parts.every((part) => /^-?\d+(\.\d+)?$/.test(part)) ? parts : [];
}

export function cssColor(color: [number, number, number, number]): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, "0");
  return `#${channel(color[0])}${channel(color[1])}${channel(color[2])}`;
}

export function swatchColor(value: string): string | null {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^0x[0-9a-f]{6,8}$/i.test(text)) return `#${text.slice(2, 8)}`;
  const parts = numericParts(text).map(Number);
  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    const scale = parts[0]! > 1 || parts[1]! > 1 || parts[2]! > 1 ? 1 : 255;
    const channel = (part: number) => Math.max(0, Math.min(255, Math.round(part * scale))).toString(16).padStart(2, "0");
    return `#${channel(parts[0]!)}${channel(parts[1]!)}${channel(parts[2]!)}`;
  }
  return null;
}

const AXIS_LABELS: Partial<Record<KnobKind, readonly string[]>> = {
  xy: ["x", "y"],
  xyz: ["x", "y", "z"],
  uv: ["u", "v"],
  wh: ["w", "h"],
  bbox: ["x", "y", "r", "t"],
  box3: ["x", "y", "n", "r", "t", "f"],
  scale: ["x", "y"],
  vec2: ["x", "y"],
  vec3: ["x", "y", "z"],
  vec4: ["x", "y", "z", "w"],
  color: ["r", "g", "b"],
  acolor: ["r", "g", "b", "a"],
  positionVector: ["x", "y", "z", "x", "y", "z"],
};

const GANGED_KINDS = new Set<KnobKind>(["wh", "scale", "color", "acolor"]);
const SLIDER_KINDS = new Set<KnobKind>(["float", "double", "pixelAspect", "wh", "scale", "color", "acolor"]);

export function axisLabels(kind: KnobKind): readonly string[] | null {
  return AXIS_LABELS[kind] ?? null;
}

/** WH, scale, and color start as one field until the components differ. */
export function gangsUniform(kind: KnobKind): boolean {
  return GANGED_KINDS.has(kind);
}

/** Float knobs draw a slider. Int knobs do not. */
export function showsSlider(kind: KnobKind): boolean {
  return SLIDER_KINDS.has(kind);
}

export function matrixRows(value: string): string[][] | null {
  const text = value.trim();
  const body = text.startsWith("{") && text.endsWith("}") ? text.slice(1, -1).trim() : text;
  if (!body.startsWith("{")) return null;
  const rows: string[][] = [];
  let index = 0;
  while (index < body.length) {
    while (index < body.length && /\s/.test(body[index] ?? "")) index += 1;
    if (index >= body.length) break;
    if (body[index] !== "{") return null;
    const end = matchBraceLocal(body, index);
    if (end < 0) return null;
    const cells = body
      .slice(index + 1, end)
      .trim()
      .split(/\s+/)
      .filter((cell) => cell.length > 0);
    if (cells.length === 0 || cells.some((cell) => !/^-?\d+(?:\.\d+)?$/.test(cell))) return null;
    rows.push(cells);
    index = end + 1;
  }
  return rows.length > 0 ? rows : null;
}

export function chipColor(value: string): string | null {
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const packed = Number(text);
    if (!Number.isFinite(packed)) return null;
    const rgb = Math.floor(packed / 256) % 0x1000000;
    return `#${rgb.toString(16).padStart(6, "0")}`;
  }
  return swatchColor(text);
}

function matchBraceLocal(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function componentCount(kind: KnobKind): number {
  if (kind === "wh" || kind === "xy" || kind === "uv" || kind === "vec2" || kind === "scale") return 2;
  if (kind === "xyz" || kind === "vec3") return 3;
  if (kind === "bbox" || kind === "vec4") return 4;
  if (kind === "box3") return 6;
  return 1;
}

function panelLabel(knob: KnobSpec, previous: PropertyControl | undefined): KnobSpec {
  if (knob.label.trim() || knob.name.startsWith("panel_")) return knob;
  const opens = knob.startLine || !previous || previous.kind === "tab" || previous.kind === "tabGroup";
  if (!opens) return knob;
  return { ...knob, label: knob.name };
}

function appendCustom(tabs: PropertyTab[], knobs: KnobSpec[], node: DagNode, scope?: TclScope) {
  let current: PropertyTab | null = null;
  knobs.forEach((knob, index) => {
    if (TAB_KINDS.has(knob.kind)) {
      current = { id: `custom-${knob.name || index}`, name: knob.label || "Tab", controls: [] };
      tabs.push(current);
      return;
    }
    if (!current) {
      current = { id: "user", name: "User", controls: [] };
      tabs.push(current);
    }
    current.controls.push(apply(node.knobs, knob, 1000 + index, scope));
  });
}

function packTabs(classTab: string, controls: PropertyControl[]): PropertyTab[] {
  const tabs: PropertyTab[] = [];
  let current: PropertyTab = { id: "class", name: classTab, controls: [] };
  tabs.push(current);
  for (const control of controls) {
    if (TAB_KINDS.has(control.kind)) {
      current = { id: `tab-${control.id}`, name: control.label || "Tab", controls: [] };
      tabs.push(current);
      continue;
    }
    current.controls.push(control);
  }
  return tabs;
}

function nodeTab(node: DagNode, scope?: TclScope): PropertyTab {
  const tile = node.knobs.tile_color ?? cssColor(node.color);
  const controls = [
    literal(node, "label", "label", "multilineEval", "", true, scope),
    literal(node, "note_font", "font", "freetype", "", true, scope),
    literal(node, "note_font_size", "font size", "array", "11", false, scope),
    literal(node, "note_font_color", "font color", "colorChip", "0", false, scope),
    literal(node, "hide_input", "hide input", "bool", "false", true, scope),
    literal(node, "cached", "cached", "bool", "false", true, scope),
    literal(node, "disable", "disable", "bool", "false", true, scope),
    literal(node, "dope_sheet", "dope sheet", "bool", "false", true, scope),
    literal(node, "bookmark", "bookmark", "bool", "false", true, scope),
    literal(node, "postage_stamp", "postage stamp", "bool", "false", true, scope),
    literal(node, "postage_stamp_frame", "frame", "array", "1", false, scope),
    literal(node, "lifetimeStart", "lifetime start", "array", "0", true, scope),
    literal(node, "lifetimeEnd", "lifetime end", "array", "0", false, scope),
    literal(node, "useLifetime", "use lifetime", "bool", "false", false, scope),
    literal(node, "tile_color", "tile color", "colorChip", tile, true, scope),
  ];
  return { id: "node", name: "Node", controls };
}

function literal(
  node: DagNode,
  name: string,
  label: string,
  kind: KnobKind,
  fallback: string,
  startLine: boolean,
  scope?: TclScope,
): PropertyControl {
  return apply(
    node.knobs,
    {
      name,
      kind,
      label,
      tooltip: "",
      menu: [],
      optionLabels: [],
      link: "",
      min: null,
      max: null,
      startLine,
      hidden: false,
      defaultValue: fallback,
    },
    name.length,
    scope,
  );
}

function inferControl(name: string, value: string, index: number, scope?: TclScope): PropertyControl {
  const parts = numericParts(value);
  const kind: KnobKind = isOn(value) || value === "false" ? "bool" : parts.length > 1 ? "array" : /^-?\d+(\.\d+)?$/.test(value.trim()) ? "float" : "string";
  return apply(
    { [name]: value },
    {
      name,
      kind,
      label: name,
      tooltip: "",
      menu: [],
      optionLabels: [],
      link: "",
      min: null,
      max: null,
      startLine: true,
      hidden: false,
      defaultValue: value,
    },
    index,
    scope,
  );
}

const PYTHON_KNOBS = new Set<KnobKind>(["python", "pluginPython", "pyscript"]);

function apply(knobs: Record<string, string>, knob: KnobSpec, index: number, scope?: TclScope): PropertyControl {
  const raw = Object.prototype.hasOwnProperty.call(knobs, knob.name) ? (knobs[knob.name] ?? "") : knob.defaultValue;
  const value = displayKnob(raw, knob.kind, scope);
  const menus = menuFor(knob, value);
  const tooltip = knob.link ? `Linked to ${knob.link}` : value !== raw && !knob.tooltip ? raw : knob.tooltip;
  return {
    id: `${knob.name || knob.kind}-${index}`,
    name: knob.name,
    kind: knob.kind,
    label: knob.label,
    tooltip,
    value,
    options: menus.options,
    optionLabels: menus.optionLabels,
    min: knob.min,
    max: knob.max,
    checked: isOn(value),
    channels: channelMask(value),
    secret: knob.kind === "password",
    startLine: knob.startLine,
  };
}

function displayKnob(raw: string, kind: KnobKind, scope?: TclScope): string {
  if (!scope) return raw;
  if (PYTHON_KNOBS.has(kind) && raw.trim()) return "python";
  return renderKnob(raw, scope);
}

function menuFor(knob: KnobSpec, value: string): { options: string[]; optionLabels: string[] } {
  if (knob.menu.length === 0) {
    return value ? { options: [value], optionLabels: [value] } : { options: [], optionLabels: [] };
  }
  const options = [...knob.menu];
  const optionLabels = knob.optionLabels.length === knob.menu.length ? [...knob.optionLabels] : [...knob.menu];
  if (value && !options.includes(value)) {
    options.unshift(value);
    optionLabels.unshift(value);
  }
  return { options, optionLabels };
}

function rowToSpec(row: KnobRow): KnobSpec {
  const menu = parseMenu(row[5] ?? "");
  return {
    name: row[0],
    kind: row[1],
    label: row[2],
    tooltip: "",
    menu: menu.values,
    optionLabels: menu.labels,
    link: "",
    min: row[6] ?? null,
    max: row[7] ?? null,
    startLine: row[4] === 1,
    hidden: false,
    defaultValue: row[3],
  };
}

function userSpec(knob: UserKnob): KnobSpec {
  return {
    name: knob.name,
    kind: knob.kind,
    label: knob.label,
    tooltip: knob.tooltip,
    menu: knob.menu,
    optionLabels: knob.menu,
    link: knob.link,
    min: knob.min,
    max: knob.max,
    startLine: knob.startLine,
    hidden: knob.hidden,
    defaultValue: knob.kind === "bool" || knob.kind === "disable" ? "false" : "",
  };
}

function parseMenu(text: string): { values: string[]; labels: string[] } {
  if (!text) return { values: [], labels: [] };
  const values: string[] = [];
  const labels: string[] = [];
  for (const line of text.split("\n")) {
    const bits = line.split("\t").filter((bit) => bit.length > 0);
    if (bits.length === 0) continue;
    const value = bits[0] ?? "";
    values.push(value);
    labels.push(bits[bits.length - 1] ?? value);
  }
  return { values, labels };
}

function isOn(value: string): boolean {
  const text = value.trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

function tabTitle(className: string): string {
  if (className === "Merge2") return "Merge";
  if (className === "Shuffle2") return "Shuffle";
  return className;
}
