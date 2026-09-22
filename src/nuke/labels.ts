type Kind = "node" | "dot" | "backdrop" | "sticky";

const SKIP_LAYER = new Set(["rgba", "rgb", "all", "-", ""]);

/** Node text, following Nuke's autolabel: name, then class info, then the label knob. */
export function labelLines(
  className: string,
  name: string,
  kind: Kind,
  knobs: Record<string, string>,
): string[] {
  const userLabel = substituteKnobRefs(plainKnob(knobs.label), knobs).trim();
  if (kind === "dot") return userLabel ? splitLines(userLabel) : [];
  if (kind === "backdrop" || kind === "sticky") {
    return userLabel ? splitLines(userLabel) : [name];
  }

  let heading = name;
  const file = fileBase(knobs.file);
  if (file && isFileClass(className)) heading = `${heading}\n${file}`;
  const operation = plainKnob(knobs.operation);
  if (operation && className !== "ChannelMerge" && className !== "Precomp" && className !== "LiveGroup") {
    heading = `${heading} (${operation})`;
  }

  let layer = layerFor(className, knobs);
  const mask = plainKnob(knobs.maskChannelInput);
  if (mask && mask !== "none") layer = layer && layer !== "-" ? `${layer} / ${mask}` : mask;

  const parts = [heading];
  if (!SKIP_LAYER.has(layer)) parts.push(`(${layer})`);
  if (userLabel) parts.push(userLabel);
  return parts.join("\n").split("\n").filter((line) => line.length > 0);
}

function layerFor(className: string, knobs: Record<string, string>): string {
  if (className === "FrameHold") {
    const frame = plainKnob(knobs.first_frame);
    if (!frame) return "-";
    const increment = plainKnob(knobs.increment);
    return increment && increment !== "0" ? `frame ${frame}+n*${increment}` : `frame ${frame}`;
  }
  if (className === "Copy") {
    const rows: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const from = plainKnob(knobs[`from${index}`]);
      const to = plainKnob(knobs[`to${index}`]);
      if (from && to && to !== "none") rows.push(`${from} -> ${to}`);
    }
    return rows.length > 0 ? rows.join("\n") : "-";
  }
  if (className === "ChannelMerge") {
    const op = mergeSymbol(plainKnob(knobs.operation) || "union");
    const output = plainKnob(knobs.output) || "rgba";
    return `${plainKnob(knobs.A) || "rgba"} ${op} ${plainKnob(knobs.B) || "rgba"} =\n${output}`;
  }
  if (className === "Precomp" || className === "LiveGroup") return "-";
  return plainKnob(knobs.output) || plainKnob(knobs.channels) || "-";
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

/** Resolves the `[value knob]` references gizmos put in their label. */
export function substituteKnobRefs(text: string, knobs: Record<string, string>): string {
  return text.replace(/\[(?:value|knob)\s+([A-Za-z_][\w.]*)\]/g, (_match, reference: string) => {
    const key = reference.startsWith("this.") ? reference.slice(5) : reference;
    const value = knobs[key];
    return value === undefined ? _match : plainKnob(value);
  });
}

function splitLines(value: string): string[] {
  return value.split("\n");
}
