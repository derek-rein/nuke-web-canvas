import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { createNukeRenderer, type Camera, type NukeRenderer } from "./gpu/renderer.ts";
import { hitTest } from "./nuke/hitTest.ts";
import { parseNukeScript } from "./nuke/parse.ts";
import { buildScene, type DagNode, type DagScene } from "./nuke/scene.ts";
import { measureDagText } from "./gpu/textAtlas.ts";

export function NukeDag(props: {
  script: string;
  className?: string;
  style?: CSSProperties;
  onSelectNode?: (node: DagNode | null) => void;
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<NukeRenderer | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const fittedScene = useRef<string | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [gpuState, setGpuState] = useState<"loading" | "ready" | "drawn" | "error">("loading");
  const [path, setPath] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  const parsed = useMemo(() => {
    try {
      return { scene: buildScene(parseNukeScript(props.script), measureDagText), error: null as string | null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not parse the Nuke script";
      return { scene: null, error: message };
    }
  }, [props.script]);

  const current = parsed.scene ? sceneAt(parsed.scene, path) : null;
  const crumbs = useMemo(() => crumbsFor(parsed.scene, path), [parsed.scene, path]);

  useEffect(() => {
    setPath([]);
  }, [props.script]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || parsed.error) return;
    let cancelled = false;
    const rendererPromise = createNukeRenderer(canvas);
    rendererPromise.then(
      (renderer) => {
        if (cancelled) {
          renderer.destroy();
          return;
        }
        rendererRef.current = renderer;
        setGpuError(null);
        setGpuState("ready");
        setReady(true);
      },
      (error: unknown) => {
        if (cancelled) return;
        setGpuError(error instanceof Error ? error.message : "WebGPU is not available");
        setGpuState("error");
      },
    );
    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      setReady(false);
    };
  }, [parsed.error]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !wrap || !canvas || !current) return;
    renderer.setScene(current);
    renderer.setSelected(null);
    fittedScene.current = null;
    const paint = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      if (fittedScene.current !== current.id) {
        cameraRef.current = fitCamera(current, rect.width, rect.height);
        fittedScene.current = current.id;
      }
      renderer.setCamera(cameraRef.current);
      try {
        renderer.draw();
        setGpuState((state) => (state === "drawn" ? state : "drawn"));
      } catch (error) {
        setGpuState("error");
        setGpuError(error instanceof Error ? error.message : "Could not draw the node graph");
      }
    };
    let attempts = 0;
    const paintSoon = () => {
      attempts += 1;
      const rect = wrap.getBoundingClientRect();
      if ((rect.width < 2 || rect.height < 2) && attempts < 30) {
        requestAnimationFrame(paintSoon);
        return;
      }
      paint();
    };
    paintSoon();
    const observer = new ResizeObserver(paint);
    observer.observe(wrap);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const camera = cameraRef.current;
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const dagX = camera.x + sx / camera.zoom;
      const dagY = camera.y + sy / camera.zoom;
      const zoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.0015), 0.05, 8);
      cameraRef.current = { x: dagX - sx / zoom, y: dagY - sy / zoom, zoom };
      renderer.setCamera(cameraRef.current);
      renderer.draw();
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener("wheel", wheel);
    };
  }, [current, ready]);

  function draw() {
    rendererRef.current?.setCamera(cameraRef.current);
    rendererRef.current?.draw();
  }

  function eventToDag(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    return {
      x: camera.x + (event.clientX - rect.left) / camera.zoom,
      y: camera.y + (event.clientY - rect.top) / camera.zoom,
    };
  }

  return (
    <div
      ref={wrapRef}
      className={props.className}
      data-gpu={gpuState}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== "f" && event.key !== "F") return;
        if (!current || !wrapRef.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        cameraRef.current = fitCamera(current, rect.width, rect.height);
        draw();
      }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#1c1c1c",
        outline: "none",
        ...props.style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas || !current) return;
          canvas.setPointerCapture(event.pointerId);
          const startX = event.clientX;
          const startY = event.clientY;
          const origin = { ...cameraRef.current };
          let moved = false;
          const move = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.hypot(dx, dy) > 4) moved = true;
            cameraRef.current = {
              x: origin.x - dx / origin.zoom,
              y: origin.y - dy / origin.zoom,
              zoom: origin.zoom,
            };
            draw();
          };
          const up = (ev: PointerEvent) => {
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            if (moved) return;
            const dag = eventToDag(ev);
            const hit = dag ? hitTest(current, dag.x, dag.y) : null;
            rendererRef.current?.setSelected(hit?.id ?? null);
            rendererRef.current?.draw();
            props.onSelectNode?.(hit);
          };
          canvas.addEventListener("pointermove", move);
          canvas.addEventListener("pointerup", up);
        }}
        onDoubleClick={(event) => {
          if (!current) return;
          const dag = eventToDag(event);
          if (!dag) return;
          const hit = hitTest(current, dag.x, dag.y);
          if (!hit?.graph) return;
          setPath((items) => [...items, hit.id]);
          props.onSelectNode?.(null);
        }}
      />
      <nav
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          display: "flex",
          gap: 6,
          font: "12px Verdana, sans-serif",
          color: "#ddd",
        }}
      >
        {crumbs.map((crumb, index) => (
          <button
            key={crumb.id}
            type="button"
            onClick={() => setPath(path.slice(0, index))}
            style={{
              background: "transparent",
              color: "#ddd",
              border: 0,
              padding: 0,
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {index > 0 ? "/ " : ""}
            {crumb.name}
          </button>
        ))}
      </nav>
      {parsed.error || gpuError ? (
        <p style={{ position: "absolute", inset: 48, margin: 0, color: "#ddd", font: "12px Verdana, sans-serif" }}>
          {parsed.error ?? gpuError}
        </p>
      ) : null}
    </div>
  );
}

function sceneAt(root: DagScene, path: string[]): DagScene {
  let current = root;
  for (const id of path) {
    const next = current.nodes.find((node) => node.id === id)?.graph;
    if (!next) return current;
    current = next;
  }
  return current;
}

function crumbsFor(root: DagScene | null, path: string[]): Array<{ id: string; name: string }> {
  const crumbs = [{ id: "root", name: "Root" }];
  if (!root) return crumbs;
  let current = root;
  for (const id of path) {
    const node = current.nodes.find((item) => item.id === id);
    if (!node?.graph) break;
    crumbs.push({ id: node.id, name: node.name });
    current = node.graph;
  }
  return crumbs;
}

function fitCamera(scene: DagScene, cssWidth: number, cssHeight: number): Camera {
  const padding = 48;
  const width = Math.max(scene.bounds.w, 1);
  const height = Math.max(scene.bounds.h, 1);
  const zoom = clamp(
    Math.min((cssWidth - padding * 2) / width, (cssHeight - padding * 2) / height),
    0.05,
    2,
  );
  return {
    x: scene.bounds.x + scene.bounds.w / 2 - cssWidth / zoom / 2,
    y: scene.bounds.y + scene.bounds.h / 2 - cssHeight / zoom / 2,
    zoom,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(min, value));
}
