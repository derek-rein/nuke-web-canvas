type Rgba = [number, number, number, number];

// Flat tile colors from a fresh Nuke graph (https://i.imgur.com/4fhVHgy.png).
// The printed hex on that chart matches the swatch except where the label was copied
// onto the wrong group. Node bodies darken toward the bottom; these are the top color.
const KEYER = "6abd45";
const DRAW = "74c26f";
const OCIO = "21aa96";
const GEOTOOLS = "21ab95";
const COLOR = "84a4d6";
const MERGE = "5160ac";
const DEEP = "201b5a";
const TRANSFORM = "a579a9";
const CHANNEL = "a03a62";
const THREED = "9c1b1f";
const FILTER = "cc804d";
const TIME = "afa55c";
const WRITE = "c0be30";
const STICKY = "cccc80";
const DEFAULT = "cccccc";

const CLASS_COLORS: Record<string, string> = {
  Keyer: KEYER,
  HueKeyer: KEYER,
  IBKColour: KEYER,
  IBKGizmo: KEYER,
  Difference: KEYER,
  ChromaKeyer: KEYER,

  Roto: DRAW,
  RotoPaint: DRAW,
  Grid: DRAW,
  Radial: DRAW,
  Ramp: DRAW,
  Rectangle: DRAW,
  Noise: DRAW,
  Dither: DRAW,

  OCIOColorSpace: OCIO,
  OCIODisplay: OCIO,
  OCIOFileTransform: OCIO,
  OCIOCDLTransform: OCIO,
  OCIOLogConvert: OCIO,

  GeoCard: GEOTOOLS,
  GeoCube: GEOTOOLS,
  GeoCylinder: GEOTOOLS,
  GeoSphere: GEOTOOLS,
  GeoTransform: GEOTOOLS,
  GeoScene: GEOTOOLS,
  GeoMerge: GEOTOOLS,
  GeoScope: GEOTOOLS,
  GeoBindMaterial: GEOTOOLS,
  GeoDisplace: GEOTOOLS,

  Add: COLOR,
  Multiply: COLOR,
  Gamma: COLOR,
  Grade: COLOR,
  ColorCorrect: COLOR,
  HueCorrect: COLOR,
  HueShift: COLOR,
  Clamp: COLOR,
  Invert: COLOR,
  Saturation: COLOR,
  ColorLookup: COLOR,
  ColorMatrix: COLOR,
  Colorspace: COLOR,
  Exposure: COLOR,
  SoftClip: COLOR,
  RolloffContrast: COLOR,
  HistEQ: COLOR,
  HSVTool: COLOR,
  Log2Lin: COLOR,

  Merge2: MERGE,
  ChannelMerge: MERGE,
  Dissolve: MERGE,
  Switch: MERGE,
  Keymix: MERGE,

  DeepRead: DEEP,
  DeepMerge: DEEP,
  DeepRecolor: DEEP,
  DeepCrop: DEEP,
  DeepTransform: DEEP,
  DeepHoldout: DEEP,
  DeepToImage: DEEP,
  DeepFromImage: DEEP,
  DeepExpression: DEEP,

  Transform: TRANSFORM,
  TransformMasked: TRANSFORM,
  CornerPin2D: TRANSFORM,
  Crop: TRANSFORM,
  Reformat: TRANSFORM,
  Mirror2: TRANSFORM,
  Position: TRANSFORM,
  STMap: TRANSFORM,
  IDistort: TRANSFORM,
  SphericalTransform: TRANSFORM,
  LensDistortion: TRANSFORM,
  LensDistortion2: TRANSFORM,
  GridWarp3: TRANSFORM,
  SplineWarp3: TRANSFORM,

  Copy: CHANNEL,
  Shuffle: CHANNEL,
  Shuffle2: CHANNEL,
  ShuffleCopy: CHANNEL,
  Remove: CHANNEL,
  AddChannels: CHANNEL,

  Scene: THREED,
  Axis: THREED,
  Axis2: THREED,
  Axis3: THREED,
  Axis4: THREED,
  Camera: THREED,
  Camera2: THREED,
  Camera3: THREED,
  ScanlineRender: THREED,
  Card2: THREED,
  ReadGeo2: THREED,
  TransformGeo: THREED,
  MergeGeo: THREED,
  DepthToPoints: THREED,
  Light: THREED,
  Environment: THREED,

  Blur: FILTER,
  Defocus: FILTER,
  Dilate: FILTER,
  Erode: FILTER,
  FilterErode: FILTER,
  Median: FILTER,
  Glow: FILTER,
  Sharpen: FILTER,
  Emboss: FILTER,
  Convolve: FILTER,
  Matrix: FILTER,
  GodRays: FILTER,
  Inpaint2: FILTER,
  Denoise: FILTER,
  EdgeDetect: FILTER,
  MotionBlur2D: FILTER,
  VectorBlur: FILTER,
  ZDefocus: FILTER,
  DirBlur: FILTER,
  Soften: FILTER,

  FrameHold: TIME,
  TimeOffset: TIME,
  TimeClip: TIME,
  TimeEcho: TIME,
  Retime: TIME,
  FrameRange: TIME,
  AppendClip: TIME,

  Write: WRITE,
  WriteGeo: WRITE,

  StickyNote: STICKY,

  Text: DEFAULT,
  Text2: DEFAULT,
  Tracker: DEFAULT,
  Tracker4: DEFAULT,
  Premult: DEFAULT,
  Unpremult: DEFAULT,
  NoOp: DEFAULT,
  Dot: DEFAULT,
  Input: DEFAULT,
  Output: DEFAULT,

  Viewer: "4c9a4c",
  Read: "4d6d8c",
  Constant: "4d6d8c",
  CheckerBoard2: "4d6d8c",
  ColorBars: "4d6d8c",
  ColorWheel: "4d6d8c",
  Group: "5c6770",
  Gizmo: "5c6770",
  LiveGroup: "5c6770",
  VariableGroup: "5c6770",
  BackdropNode: "717171",
};

export function classColor(className: string): Rgba {
  return rgbHex(CLASS_COLORS[className] ?? DEFAULT);
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
  // Nuke draws black labels on the orange, mauve, and gray tiles, and white on merge and deep.
  return luminance > 0.5 ? [0, 0, 0, 1] : [1, 1, 1, 1];
}

function rgbHex(hex: string): Rgba {
  const value = Number.parseInt(hex, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
}
