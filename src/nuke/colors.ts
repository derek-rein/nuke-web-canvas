type Rgba = [number, number, number, number];

const CLASS_COLORS: Record<string, string> = {
  Merge2: "2c3f86",
  ChannelMerge: "2c3f86",
  Dissolve: "2c3f86",
  Grade: "6d8199",
  ColorCorrect: "6d8199",
  HueCorrect: "6d8199",
  Clamp: "7085aa",
  Invert: "798eb3",
  Copy: "a33966",
  Shuffle: "812d50",
  Shuffle2: "812d50",
  Remove: "812d50",
  Blur: "b47349",
  Defocus: "b47349",
  FilterErode: "b06c3b",
  Inpaint2: "b06c3b",
  Roto: "498244",
  RotoPaint: "498244",
  Crop: "8d6993",
  Reformat: "8d6993",
  CornerPin2D: "8d6993",
  Transform: "8d6993",
  TransformMasked: "8d6993",
  LensDistortion2: "735378",
  FrameHold: "c6a84a",
  Text: "e4e4e4",
  Text2: "e4e4e4",
  Tracker: "b5b5b5",
  Tracker4: "b5b5b5",
  Premult: "c8c8c8",
  Unpremult: "c8c8c8",
  Write: "848401",
  TimeEcho: "9a8e48",
  TimeClip: "8d8343",
  Scene: "014500",
  Axis3: "014500",
  Axis4: "014500",
  Camera3: "014500",
  ScanlineRender: "014500",
  DepthToPoints: "014500",
  Viewer: "4c9a4c",
  Read: "4d6d8c",
  Constant: "4d6d8c",
  CheckerBoard2: "4d6d8c",
  ColorBars: "4d6d8c",
  ColorWheel: "4d6d8c",
  Noise: "4d6d8c",
  Group: "5c6770",
  Gizmo: "5c6770",
  LiveGroup: "5c6770",
  VariableGroup: "5c6770",
  NoOp: "8a8a8a",
  Dot: "e8e8e8",
  Input: "b4b4b4",
  Output: "b4b4b4",
  BackdropNode: "717171",
  StickyNote: "ccc576",
};

export function classColor(className: string): Rgba {
  return rgbHex(CLASS_COLORS[className] ?? "8a8a8a");
}

export function parseTileColor(raw: string | undefined): Rgba | null {
  if (!raw) return null;
  const text = raw.trim();
  const hex = text.startsWith("0x") || text.startsWith("0X") ? text.slice(2) : null;
  const value = hex
    ? Number.parseInt(hex, 16)
    : /^\d+$/.test(text)
      ? Number(text)
      : Number.NaN;
  if (!Number.isFinite(value)) return null;
  const bits = value >>> 0;
  return [(bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255].map(
    (channel) => channel / 255,
  ) as Rgba;
}

export function textColorFor(color: Rgba): Rgba {
  const luminance = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
  return luminance > 0.62 ? [0, 0, 0, 1] : [1, 1, 1, 1];
}

function rgbHex(hex: string): Rgba {
  const value = Number.parseInt(hex, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
}
