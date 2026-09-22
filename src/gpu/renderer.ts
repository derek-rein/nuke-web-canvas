import { d, std, tgpu } from "typegpu";
import type { DagScene } from "../nuke/scene.ts";
import { buildGeometry, type Vertex } from "./geometry.ts";
import { TextAtlas } from "./textAtlas.ts";

export type Camera = { x: number; y: number; zoom: number };

export type NukeRenderer = {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  setScene(scene: DagScene): void;
  setCamera(camera: Camera): void;
  setSelected(id: string | null): void;
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

export async function createNukeRenderer(canvas: HTMLCanvasElement): Promise<NukeRenderer> {
  if (!navigator.gpu) throw new Error("WebGPU is not available");
  const root = await tgpu.init();
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
  let selectedId: string | null = null;
  let dpr = 1;
  let geometryKey = "";
  let vertexCount = 0;
  let liveBuffer: { destroy(): void } | null = null;
  let drawPipeline: { draw(vertexCount: number): void } | null = null;

  function rebuild(vertices: Vertex[]): void {
    const count = Math.max(vertices.length, 1);
    const schema = d.arrayOf(GpuVertex, count);
    const data = vertices.length > 0 ? vertices.map(toGpuVertex) : [toGpuVertex(emptyVertex())];
    liveBuffer?.destroy();
    const buffer = root.createBuffer(schema, data).$usage("storage");
    liveBuffer = buffer;
    const stored = buffer.as("readonly");
    const vertexMain = tgpu.vertexFn({
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
    const fragmentMain = tgpu.fragmentFn({
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
      if (input.mode < 0.5) return input.color;
      if (input.mode < 1.5) {
        const dist = roundRectDistance(input.uv.x, input.uv.y, input.halfX, input.halfY, input.radius);
        const aa = std.fwidth(dist);
        const alpha = 1 - std.smoothstep(0 - aa, aa, dist);
        return d.vec4f(input.color.x, input.color.y, input.color.z, input.color.w * alpha);
      }
      if (input.mode < 2.5) {
        const dist = std.sqrt(input.uv.x * input.uv.x + input.uv.y * input.uv.y) - input.radius;
        const aa = std.fwidth(dist);
        const alpha = 1 - std.smoothstep(0 - aa, aa, dist);
        return d.vec4f(input.color.x, input.color.y, input.color.z, input.color.w * alpha);
      }
      const texel = std.textureSample(atlasView.$, sampler.$, input.uv);
      return d.vec4f(input.color.x, input.color.y, input.color.z, input.color.w * texel.w);
    });
    const pipeline = root.createRenderPipeline({
      vertex: vertexMain,
      fragment: fragmentMain,
      primitive: { topology: "triangle-list" },
      targets: {
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        },
      },
    });
    vertexCount = vertices.length;
    drawPipeline = {
      draw(countToDraw: number) {
        pipeline
          .withColorAttachment({
            view: context,
            clearValue: [0.11, 0.11, 0.11, 1],
            loadOp: "clear",
            storeOp: "store",
          })
          .draw(countToDraw);
      },
    };
  }

  function ensureGeometry(): void {
    if (!scene) return;
    const key = `${scene.id}:${camera.zoom.toFixed(3)}:${selectedId ?? ""}`;
    if (key === geometryKey && drawPipeline) return;
    const vertices = buildGeometry(scene, camera.zoom, atlas, selectedId);
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
    setSelected(id) {
      selectedId = id;
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
      drawPipeline?.draw(vertexCount);
    },
    destroy() {
      root.destroy();
    },
  };
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

function emptyVertex(): Vertex {
  return { x: 0, y: 0, r: 0, g: 0, b: 0, a: 0, u: 0, v: 0, mode: 0, radius: 0 };
}
