import { renderKnob, renderText, selfScope, type TclScope } from "./tcl.ts";

type Kind = "node" | "dot" | "backdrop" | "sticky";

const SKIP_LAYER = new Set(["rgba", "rgb", "all", "-", ""]);

/** Node text, following Nuke's autolabel: name, then class info, then the label knob. */
export function labelLines(
  className: string,
  name: string,
  kind: Kind,
  knobs: Record<string, string>,
  scope?: TclScope,
): string[] {
  const userLabel = show(knobs.label, scope).trim();
  if (kind === "dot") return userLabel ? splitLines(userLabel) : [];
  if (kind === "backdrop" || kind === "sticky") {
    return userLabel ? splitLines(userLabel) : [name];
  }

  let heading = name;
  const file = fileBase(show(knobs.file, scope));
  if (file && isFileClass(className)) heading = `${heading}\n${file}`;
  const operation = show(knobs.operation, scope);
  if (operation && className !== "ChannelMerge" && className !== "Precomp" && className !== "LiveGroup") {
    heading = `${heading} (${operation})`;
  }

  let layer = layerFor(className, knobs, scope);
  const mask = show(knobs.maskChannelInput, scope);
  if (mask && mask !== "none") layer = layer && layer !== "-" ? `${layer} / ${mask}` : mask;

  const parts = [heading];
  if (!SKIP_LAYER.has(layer)) parts.push(`(${layer})`);
  if (userLabel) parts.push(userLabel);
  return parts.join("\n").split("\n").filter((line) => line.length > 0);
}

function layerFor(className: string, knobs: Record<string, string>, scope?: TclScope): string {
  if (className === "FrameHold") {
    const frame = show(knobs.first_frame, scope);
    if (!frame) return "-";
    const increment = show(knobs.increment, scope);
    return increment && increment !== "0" ? `frame ${frame}+n*${increment}` : `frame ${frame}`;
  }
  if (className === "Copy") {
    const rows: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const from = show(knobs[`from${index}`], scope);
      const to = show(knobs[`to${index}`], scope);
      if (from && to && to !== "none") rows.push(`${from} -> ${to}`);
    }
    return rows.length > 0 ? rows.join("\n") : "-";
  }
  if (className === "ChannelMerge") {
    const op = mergeSymbol(show(knobs.operation, scope) || "union");
    const output = show(knobs.output, scope) || "rgba";
    return `${show(knobs.A, scope) || "rgba"} ${op} ${show(knobs.B, scope) || "rgba"} =\n${output}`;
  }
  if (className === "Precomp" || className === "LiveGroup") return "-";
  return show(knobs.output, scope) || show(knobs.channels, scope) || "-";
}

function mergeSymbol(operation: string): string {
  const symbols: Record<string, string> = {
    union: "U",
    intersect: "I",
    stencil: "S",
    absminus: "abs-",
    plus: "+",
    minus: "-",
    multiply: "*",
  };
  return symbols[operation] ?? operation;
}

function isFileClass(className: string): boolean {
  return (
    className.startsWith("Read") ||
    className.startsWith("Write") ||
    className.startsWith("DeepWrite") ||
    className === "DeepRead" ||
    className === "Precomp" ||
    className === "LiveGroup" ||
    className === "GeoImport" ||
    className === "GeoExport"
  );
}

function fileBase(file: string | undefined): string | null {
  const text = plainKnob(file).replaceAll('"', "");
  if (!text) return null;
  return text.split("/").filter((part) => part.length > 0).at(-1) ?? null;
}

function plainKnob(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed.slice(1, -1).trim();
  return trimmed;
}

/** Resolves TCL in a label. `[python ...]` stays a placeholder. */
export function substituteKnobRefs(text: string, knobs: Record<string, string>): string {
  return renderText(text, selfScope(knobs));
}

function show(raw: string | undefined, scope?: TclScope): string {
  if (!raw) return "";
  if (!scope) return plainKnob(raw);
  const rendered = renderKnob(raw, scope);
  return rendered === raw ? plainKnob(raw) : rendered;
}

function splitLines(value: string): string[] {
  return value.split("\n");
}
