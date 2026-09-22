type Rgba = [number, number, number, number];

const CLASS_COLORS: Record<string, string> = {
  Merge2: "3a4aa4",
  ChannelMerge: "3a4aa4",
  Dissolve: "3a4aa4",
  Grade: "637696",
  ColorCorrect: "637696",
  Clamp: "7085aa",
  Invert: "798eb3",
  Copy: "a33966",
  Shuffle: "812d50",
  Shuffle2: "812d50",
  Remove: "812d50",
  Blur: "a9683a",
  Defocus: "88542e",
  FilterErode: "b06c3b",
  Inpaint2: "b06c3b",
  Roto: "498244",
  RotoPaint: "498244",
  Crop: "906896",
  Reformat: "926c97",
  CornerPin2D: "735378",
  Transform: "745479",
  LensDistortion2: "735378",
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
  Dot: "8a8a8a",
  Input: "9a9a9a",
  Output: "9a9a9a",
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
