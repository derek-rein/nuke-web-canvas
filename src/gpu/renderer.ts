import { d, std, tgpu } from "typegpu";
import type { DagScene } from "../nuke/scene.ts";
import { buildGeometry, type Vertex } from "./geometry.ts";
import { TextAtlas } from "./textAtlas.ts";

export type Camera = { x: number; y: number; zoom: number };

export type NukeRenderer = {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  setScene(scene: DagScene): void;
  setCamera(camera: Camera): void;
  setSelected(ids: readonly string[]): void;
  draw(): void;
  destroy(): void;
};

const GpuVertex = d.struct({
  pos: d.vec2f,
  color: d.vec4f,
  uv: d.vec2f,
  params: d.vec4f,
});

const CameraSchema = d.struct({
  origin: d.vec2f,
  scale: d.f32,
  pad: d.f32,
  viewport: d.vec2f,
});

export async function createNukeRenderer(
  canvas: HTMLCanvasElement,
  hooks?: { onError?: (message: string) => void },
): Promise<NukeRenderer> {
  if (!navigator.gpu) throw new Error("WebGPU is not available");
  const root = await tgpu.init();
  root.device.addEventListener("uncapturederror", (event) => {
    const error = (event as GPUUncapturedErrorEvent).error;
    hooks?.onError?.(error.message);
  });
  const context = root.configureContext({ canvas, alphaMode: "premultiplied" });
  const cameraBuffer = root
    .createBuffer(CameraSchema, {
      origin: d.vec2f(0, 0),
      scale: 1,
      pad: 0,
      viewport: d.vec2f(1, 1),
    })
    .$usage("uniform");
  const cameraUniform = cameraBuffer.as("uniform");
  const atlas = new TextAtlas();
  const atlasTexture = root
    .createTexture({
      size: [2048, 2048],
      format: "rgba8unorm",
    })
    .$usage("sampled", "render");
  const atlasView = atlasTexture.createView();
  const sampler = root.createSampler({ magFilter: "linear", minFilter: "linear" });

  let scene: DagScene | null = null;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let selectedIds: ReadonlySet<string> = new Set();
  let dpr = 1;
  let geometryKey = "";
  let shapeCount = 0;
  let glyphCount = 0;
  const liveBuffers: Array<{ destroy(): void }> = [];
  let drawFrame: (() => void) | null = null;

  function storeOf(vertices: Vertex[]) {
    if (vertices.length === 0) return null;
    const buffer = root.createBuffer(d.arrayOf(GpuVertex, vertices.length), vertices.map(toGpuVertex)).$usage("storage");
    liveBuffers.push(buffer);
    return buffer.as("readonly");
  }

  function vertexStage(stored: NonNullable<ReturnType<typeof storeOf>>) {
    return tgpu.vertexFn({
      in: { vertexIndex: d.builtin.vertexIndex },
      out: {
        position: d.builtin.position,
        color: d.vec4f,
        uv: d.vec2f,
        mode: d.f32,
        radius: d.f32,
        halfX: d.f32,
        halfY: d.f32,
      },
    })((input) => {
      "use gpu";
      const vert = stored.$[input.vertexIndex];
      const sx = (vert.pos.x - cameraUniform.$.origin.x) * cameraUniform.$.scale;
      const sy = (vert.pos.y - cameraUniform.$.origin.y) * cameraUniform.$.scale;
      const ndcX = (sx / cameraUniform.$.viewport.x) * 2 - 1;
      const ndcY = 1 - (sy / cameraUniform.$.viewport.y) * 2;
      return {
        position: d.vec4f(ndcX, ndcY, 0, 1),
        color: vert.color,
        uv: vert.uv,
        mode: vert.params.x,
        radius: vert.params.y,
        halfX: vert.params.z,
        halfY: vert.params.w,
      };
    });
  }

  function glyphFragment() {
    return tgpu.fragmentFn({
      in: { color: d.vec4f, uv: d.vec2f },
      out: d.vec4f,
    })((input) => {
      "use gpu";
      const texel = std.textureSample(atlasView.$, sampler.$, input.uv);
      return d.vec4f(input.color.x, input.color.y, input.color.z, input.color.w * texel.w);
    });
  }

  function rebuild(vertices: Vertex[]): void {
    for (const buffer of liveBuffers) buffer.destroy();
    liveBuffers.length = 0;
    const shapes = vertices.filter((vertex) => vertex.mode !== 3);
    const glyphs = vertices.filter((vertex) => vertex.mode === 3);
    const shapeStore = storeOf(shapes);
    const glyphStore = storeOf(glyphs);
    const targets = {
      blend: {
        color: { srcFactor: "src-alpha" as const, dstFactor: "one-minus-src-alpha" as const, operation: "add" as const },
        alpha: { srcFactor: "one" as const, dstFactor: "one-minus-src-alpha" as const, operation: "add" as const },
      },
    };
    const shapePipeline = shapeStore
      ? root.createRenderPipeline({
          vertex: vertexStage(shapeStore),
          fragment: shapeFragment(),
          primitive: { topology: "triangle-list" },
          targets,
        })
      : null;
    const glyphPipeline = glyphStore
      ? root.createRenderPipeline({
          vertex: vertexStage(glyphStore),
          fragment: glyphFragment(),
          primitive: { topology: "triangle-list" },
          targets,
        })
      : null;
    shapeCount = shapes.length;
    glyphCount = glyphs.length;
    drawFrame = () => {
      shapePipeline
        ?.withColorAttachment({
          view: context,
          clearValue: [0x3c / 255, 0x3c / 255, 0x3c / 255, 1],
          loadOp: "clear",
          storeOp: "store",
        })
        .draw(shapeCount);
      if (!glyphPipeline || glyphCount === 0) return;
      glyphPipeline
        .withColorAttachment({
          view: context,
          clearValue: [0x3c / 255, 0x3c / 255, 0x3c / 255, 1],
          loadOp: shapePipeline ? "load" : "clear",
          storeOp: "store",
        })
        .draw(glyphCount);
    };
  }

  function ensureGeometry(): void {
    if (!scene) return;
    const selectedKey = [...selectedIds].sort().join("\0");
    const key = `${scene.id}:${camera.zoom.toFixed(3)}:${selectedKey}`;
    if (key === geometryKey && drawFrame) return;
    const vertices = buildGeometry(scene, camera.zoom, atlas, selectedIds);
    if (atlas.dirty.value) {
      atlasTexture.write(atlas.canvas);
      atlas.dirty.value = false;
    }
    rebuild(vertices);
    geometryKey = key;
  }

  return {
    resize(cssWidth, cssHeight, nextDpr) {
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
      canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    },
    setScene(next) {
      scene = next;
      geometryKey = "";
    },
    setCamera(next) {
      const bandChanged = (camera.zoom < 0.28) !== (next.zoom < 0.28);
      camera = next;
      if (bandChanged) geometryKey = "";
    },
    setSelected(ids) {
      selectedIds = new Set(ids);
      geometryKey = "";
    },
    draw() {
      if (!scene) return;
      ensureGeometry();
      cameraBuffer.write({
        origin: d.vec2f(camera.x, camera.y),
        scale: camera.zoom * dpr,
        pad: 0,
        viewport: d.vec2f(canvas.width, canvas.height),
      });
      drawFrame?.();
    },
    destroy() {
      root.destroy();
    },
  };
}

function shapeFragment() {
  return tgpu.fragmentFn({
    in: {
      color: d.vec4f,
      uv: d.vec2f,
      mode: d.f32,
      radius: d.f32,
      halfX: d.f32,
      halfY: d.f32,
    },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const rectDist = roundRectDistance(input.uv.x, input.uv.y, input.halfX, input.halfY, input.radius);
    const circleDist = std.sqrt(input.uv.x * input.uv.x + input.uv.y * input.uv.y) - input.radius;
    const body = input.mode > 3.5;
    const useRect = std.select(input.mode < 1.5, true, body);
    const dist = std.select(circleDist, rectDist, useRect);
    const aa = std.fwidth(dist);
    const coverage = 1 - std.smoothstep(0 - aa, aa, dist);
    const yNorm = input.uv.y / std.max(input.halfY, 1);
    // yNorm is -1 at the top of the body. Nuke's shade leaves the top at the tile color
    // and darkens the bottom to about 0.76, measured on the Draw swatch of the color chart.
    const shade = 1 - (yNorm + 1) * 0.12;
    const lit = std.select(1, shade, body);
    const rim = std.smoothstep(-1.4, -0.2, dist);
    const rimMul = std.select(1, 1 - rim * 0.22, body);
    const red = input.color.x * lit * rimMul;
    const green = input.color.y * lit * rimMul;
    const blue = input.color.z * lit * rimMul;
    const alpha = std.select(input.color.w * coverage, input.color.w, input.mode < 0.5);
    return d.vec4f(red, green, blue, alpha);
  });
}

function roundRectDistance(px: number, py: number, halfX: number, halfY: number, radius: number): number {
  "use gpu";
  const qx = std.abs(px) - halfX + radius;
  const qy = std.abs(py) - halfY + radius;
  const outside = std.sqrt(std.max(qx, 0) * std.max(qx, 0) + std.max(qy, 0) * std.max(qy, 0));
  const inside = std.min(std.max(qx, qy), 0);
  return outside + inside - radius;
}

function toGpuVertex(vertex: Vertex) {
  return {
    pos: d.vec2f(vertex.x, vertex.y),
    color: d.vec4f(vertex.r, vertex.g, vertex.b, vertex.a),
    uv: d.vec2f(vertex.u, vertex.v),
    params: d.vec4f(vertex.mode, vertex.radius, Math.abs(vertex.u), Math.abs(vertex.v)),
  };
}


