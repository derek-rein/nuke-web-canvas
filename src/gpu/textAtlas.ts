import type { Glyph, GlyphLookup } from "./geometry.ts";

const ATLAS = 2048;
const SOURCE_SIZE = 48;

export function measureDagText(line: string): number {
  const ctx = measureContext();
  if (!ctx) return line.length * 6.2;
  ctx.font = "11px Verdana, sans-serif";
  return ctx.measureText(line).width;
}

export class TextAtlas implements GlyphLookup {
  readonly canvas: HTMLCanvasElement;
  readonly dirty = { value: true };
  private readonly ctx: CanvasRenderingContext2D;
  private readonly glyphs = new Map<string, Glyph>();
  private penX = 1;
  private penY = 1;
  private rowHeight = 0;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = ATLAS;
    canvas.height = ATLAS;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not create the glyph atlas");
    ctx.clearRect(0, 0, ATLAS, ATLAS);
    ctx.font = `${SOURCE_SIZE}px Verdana, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "alphabetic";
    this.canvas = canvas;
    this.ctx = ctx;
  }

  measure(line: string): number {
    return measureDagText(line);
  }

  glyphsFor(line: string): Glyph[] {
    return [...line].map((char) => this.glyph(char));
  }

  private glyph(char: string): Glyph {
    const cached = this.glyphs.get(char);
    if (cached) return cached;
    this.ctx.font = `${SOURCE_SIZE}px Verdana, sans-serif`;
    const metrics = this.ctx.measureText(char);
    const left = metrics.actualBoundingBoxLeft;
    const right = Math.max(metrics.actualBoundingBoxRight, metrics.width);
    const ascent = metrics.actualBoundingBoxAscent || SOURCE_SIZE * 0.8;
    const descent = metrics.actualBoundingBoxDescent || SOURCE_SIZE * 0.2;
    const width = Math.max(1, Math.ceil(left + right) + 1);
    const height = Math.max(1, Math.ceil(ascent + descent) + 1);
    if (this.penX + width + 1 >= ATLAS) {
      this.penX = 1;
      this.penY += this.rowHeight + 1;
      this.rowHeight = 0;
    }
    if (this.penY + height >= ATLAS) {
      const empty = emptyGlyph(metrics.width);
      this.glyphs.set(char, empty);
      return empty;
    }
    const x = this.penX;
    const y = this.penY;
    this.ctx.fillText(char, x + left, y + ascent);
    const glyph: Glyph = {
      char,
      advance: metrics.width,
      width,
      height,
      bearingX: -left,
      bearingY: ascent,
      u0: x / ATLAS,
      v0: y / ATLAS,
      u1: (x + width) / ATLAS,
      v1: (y + height) / ATLAS,
    };
    this.penX += width + 1;
    this.rowHeight = Math.max(this.rowHeight, height);
    this.glyphs.set(char, glyph);
    this.dirty.value = true;
    return glyph;
  }
}

function emptyGlyph(advance: number): Glyph {
  return {
    char: "",
    advance,
    width: 0,
    height: 0,
    bearingX: 0,
    bearingY: 0,
    u0: 0,
    v0: 0,
    u1: 0,
    v1: 0,
  };
}

function measureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}
