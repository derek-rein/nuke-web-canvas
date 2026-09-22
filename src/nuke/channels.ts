type Rgba = [number, number, number, number];

// Classes whose channels knob has a compiled-in default. Omitted from the script means this value.
// Queried from Nuke 17. Nodes that are not listed have no channels knob, so they draw no indicators.
const DEFAULT_CHANNELS: Record<string, string> = {
  Add: "all",
  AddChannels: "none",
  Bilateral2: "all",
  Blur: "all",
  Clamp: "all",
  ColorCorrect: "rgb",
  ColorLookup: "rgba",
  ColorMatrix: "rgb",
  Convolve: "all",
  Copy: "none",
  Defocus: "all",
  Dilate: "all",
  Dissolve: "all",
  EdgeDetect: "rgb",
  Emboss: "all",
  Erode: "alpha",
  FilterErode: "alpha",
  Gamma: "all",
  Glow: "rgb",
  GodRays: "all",
  Grade: "rgb",
  HueCorrect: "rgb",
  HueKeyer: "rgb",
  HueShift: "rgb",
  Inpaint: "all",
  Inpaint2: "rgb",
  Invert: "all",
  Keymix: "all",
  Matrix: "all",
  Median: "rgb",
  Multiply: "all",
  Premult: "rgb",
  Soften: "all",
  TransformMasked: "all",
  ZDefocus: "all",
  Constant: "rgb",
  Write: "rgb",
  Roto: "rgb",
  RotoPaint: "rgb",
  Viewer: "rgba",
  OCIOColorSpace: "rgb",
  CurveTool: "rgb",
  Tracker4: "rgb",
};

const RED: Rgba = [0xe2 / 255, 0x3b / 255, 0x3b / 255, 1];
const GREEN: Rgba = [0x3c / 255, 0xba / 255, 0x3c / 255, 1];
const BLUE: Rgba = [0x3c / 255, 0x6f / 255, 0xe2 / 255, 1];
const ALPHA: Rgba = [0xf2 / 255, 0xf2 / 255, 0xf2 / 255, 1];

const RGBA: Rgba[] = [RED, GREEN, BLUE, ALPHA];
const RGB: Rgba[] = [RED, GREEN, BLUE];

export function channelIndicators(className: string, knobs: Record<string, string>): Rgba[] {
  const written = knobs.channels?.trim();
  const spec = written && written.length > 0 ? written : DEFAULT_CHANNELS[className];
  if (!spec) return [];
  return colorsForChannels(spec);
}

export function colorsForChannels(spec: string): Rgba[] {
  const text = spec.replace(/^\{/, "").replace(/\}$/, "").trim().toLowerCase();
  if (text.length === 0 || text === "none") return [];
  if (text === "all" || text === "rgba") return RGBA;
  if (text === "rgb") return RGB;
  if (text === "alpha" || text === "a" || text === "rgba.alpha") return [ALPHA];
  const colors: Rgba[] = [];
  for (const token of text.split(/[\s,]+/)) {
    colors.push(...colorsForToken(token));
  }
  return colors;
}

function colorsForToken(token: string): Rgba[] {
  if (token === "all" || token === "rgba") return RGBA;
  if (token === "rgb") return RGB;
  if (token === "alpha" || token === "a" || token === "rgba.alpha") return [ALPHA];
  if (token === "red" || token === "r" || token === "rgba.red") return [RED];
  if (token === "green" || token === "g" || token === "rgba.green") return [GREEN];
  if (token === "blue" || token === "b" || token === "rgba.blue") return [BLUE];
  if (token === "none" || token.length === 0) return [];
  return [colorForName(token)];
}

function colorForName(token: string): Rgba {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 33 + token.charCodeAt(index)) >>> 0;
  }
  const hue = (hash % 360) / 360;
  return hsv(hue, 0.55, 0.85);
}

function hsv(h: number, s: number, v: number): Rgba {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const map = [v, q, p, p, t, v];
  const order = [
    [0, 3, 2],
    [1, 0, 2],
    [2, 0, 3],
    [2, 1, 0],
    [3, 2, 0],
    [0, 2, 1],
  ][i % 6];
  return [map[order[0]], map[order[1]], map[order[2]], 1];
}
