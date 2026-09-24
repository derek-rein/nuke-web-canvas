export type ShuffleSource = {
  id: string;
  header: string;
  color: string;
  group: "in1" | "const" | "in2";
};

export const SHUFFLE_SOURCES: ShuffleSource[] = [
  { id: "red", header: "r", color: "#e23b3b", group: "in1" },
  { id: "green", header: "g", color: "#3cba3c", group: "in1" },
  { id: "blue", header: "b", color: "#3c6fe2", group: "in1" },
  { id: "alpha", header: "a", color: "#d0d0d0", group: "in1" },
  { id: "black", header: "0", color: "#111", group: "const" },
  { id: "white", header: "1", color: "#f2f2f2", group: "const" },
  { id: "red2", header: "r", color: "#9a9a9a", group: "in2" },
  { id: "green2", header: "g", color: "#9a9a9a", group: "in2" },
  { id: "blue2", header: "b", color: "#9a9a9a", group: "in2" },
  { id: "alpha2", header: "a", color: "#9a9a9a", group: "in2" },
];

export type ShuffleRow = { knob: string; label: string; source: string };

export type ClassicShuffle = {
  kind: "classic";
  in1: string;
  in2: string;
  out1: string;
  out2: string;
  rows: ShuffleRow[];
  extra: ShuffleRow[];
};

export type ShuffleLink = { src: string; dst: string };

export type LinkShuffle = {
  kind: "links";
  inInput: string;
  inLayer: string;
  outLayer: string;
  in2Input: string;
  in2Layer: string;
  out2Layer: string;
  links: ShuffleLink[];
};

export type ShuffleModel = ClassicShuffle | LinkShuffle;

const CLASSIC_DEFAULTS: Record<string, string> = {
  in: "rgba",
  in2: "none",
  out: "rgba",
  out2: "none",
  red: "red",
  green: "green",
  blue: "blue",
  alpha: "alpha",
  black: "red2",
  white: "green2",
  red2: "blue2",
  green2: "alpha2",
};

const CLASSIC_KNOBS = new Set(Object.keys(CLASSIC_DEFAULTS));
const LINK_KNOBS = new Set(["shuffle", "mappings", "fromInput1", "in1", "out1", "fromInput2", "in2", "out2"]);

const DEFAULT_LINKS: ShuffleLink[] = [
  { src: "rgba.red", dst: "rgba.red" },
  { src: "rgba.green", dst: "rgba.green" },
  { src: "rgba.blue", dst: "rgba.blue" },
  { src: "rgba.alpha", dst: "rgba.alpha" },
];

export function isShuffleKnob(className: string, name: string): boolean {
  if (className === "Shuffle") return CLASSIC_KNOBS.has(name);
  if (className === "Shuffle2") return LINK_KNOBS.has(name);
  return false;
}

export function shuffleModel(className: string, knobs: Record<string, string>): ShuffleModel | null {
  if (className === "Shuffle") return classicShuffle(knobs);
  if (className === "Shuffle2") return linkShuffle(knobs);
  return null;
}

export function channelDot(name: string): string {
  if (name.endsWith("red")) return "#e23b3b";
  if (name.endsWith("green")) return "#3cba3c";
  if (name.endsWith("blue")) return "#3c6fe2";
  return "#d0d0d0";
}

function classicShuffle(knobs: Record<string, string>): ClassicShuffle {
  const value = (name: string) => knobs[name]?.trim() || CLASSIC_DEFAULTS[name] || "";
  const row = (knob: string, label: string): ShuffleRow => ({ knob, label, source: value(knob) });
  return {
    kind: "classic",
    in1: value("in"),
    in2: value("in2"),
    out1: value("out"),
    out2: value("out2"),
    rows: [row("red", "red"), row("green", "green"), row("blue", "blue"), row("alpha", "alpha")],
    extra: [row("black", "red"), row("white", "green"), row("red2", "blue"), row("green2", "alpha")],
  };
}

function linkShuffle(knobs: Record<string, string>): LinkShuffle {
  return {
    kind: "links",
    inInput: inputLetter(knobs.fromInput1, "B"),
    inLayer: knobs.in1?.trim() || "rgba",
    outLayer: knobs.out1?.trim() || "rgba",
    in2Input: inputLetter(knobs.fromInput2, "B"),
    in2Layer: knobs.in2?.trim() || "none",
    out2Layer: knobs.out2?.trim() || "none",
    links: parseMappings(knobs.mappings) ?? DEFAULT_LINKS,
  };
}

function inputLetter(raw: string | undefined, fallback: string): string {
  const text = (raw ?? "").replace(/[{}]/g, " ").trim();
  return text.split(/\s+/).filter((part) => part.length > 0).at(-1) || fallback;
}

export function parseMappings(raw: string | undefined): ShuffleLink[] | null {
  if (!raw?.trim()) return null;
  const tokens = raw.replace(/"/g, "").trim().split(/\s+/).filter((part) => part.length > 0);
  const body = /^\d+$/.test(tokens[0] ?? "") ? tokens.slice(1) : tokens;
  const links: ShuffleLink[] = [];
  for (let index = 0; index + 5 < body.length; index += 6) {
    const src = body[index];
    const dst = body[index + 3];
    if (src && dst) links.push({ src, dst });
  }
  return links.length > 0 ? links : null;
}
