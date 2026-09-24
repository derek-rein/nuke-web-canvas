export type PrimatteModel = {
  foreground: string;
  background: string;
  crop: [number, number, number, number];
  mask: string;
  invertMask: boolean;
  algorithm: string;
  graintype: string;
  tolerance: number;
  mode: string;
  adjustLighting: boolean;
  hybridRender: boolean;
  spillProcess: string;
  replaceColor: number;
  defocus: number;
  outputMode: string;
  output: string;
};

const MODES = [
  "Smart Select BG Color",
  "Clean BG Noise",
  "Clean FG Noise",
  "Matte Sponge",
  "Make FG Trans.",
  "Restore Detail",
  "Spill Sponge",
  "Spill(-)",
  "Spill(+)",
  "Matte(-)",
  "Matte(+)",
  "Detail(-)",
  "Detail(+)",
  "Fine Tuning Sliders",
  "3D Sample",
  "Simple Select BG Color",
];

export function primatteModes(): readonly string[] {
  return MODES;
}

export function primatteModel(className: string, knobs: Record<string, string>, width = 1920, height = 1080): PrimatteModel | null {
  if (className !== "Primatte") return null;
  const crop = four(knobs.crop) ?? [0, 0, width, height];
  return {
    foreground: knobs.foreground?.trim() || "rgb",
    background: knobs.background?.trim() || "rgb",
    crop: [crop[0], crop[1], crop[2], crop[3]],
    mask: knobs.maskChannelInput?.trim() || knobs.mask?.trim() || "none",
    invertMask: on(knobs.invert_mask),
    algorithm: knobs.algorithm?.trim() || "Primatte",
    graintype: knobs.graintype?.trim() || "none",
    tolerance: number(knobs.graintolerance, 0.2),
    mode: knobs.mode?.trim() || "Smart Select BG Color",
    adjustLighting: on(knobs.adjustLighting),
    hybridRender: on(knobs.hybridRender),
    spillProcess: knobs.spillProcess?.trim() || "complement",
    replaceColor: number(knobs.replaceColor, 0.18),
    defocus: number(knobs.defocus, 10),
    outputMode: knobs.output_mode?.trim() || "composite",
    output: knobs.output?.trim() || "rgba",
  };
}

function four(raw: string | undefined): [number, number, number, number] | null {
  if (!raw?.trim()) return null;
  const nums = raw.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 4) return null;
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 0];
}

function number(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function on(raw: string | undefined): boolean {
  const text = (raw ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}
