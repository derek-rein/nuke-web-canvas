import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from "react";
import { createNukeRenderer, type Camera, type NukeRenderer } from "./gpu/renderer.ts";
import { hitTest } from "./nuke/hitTest.ts";
import { enterGroupPath, isEnterGroupKey, isLeaveGroupKey, leaveGroupPath } from "./nuke/navigate.ts";
import { parseNukeScript } from "./nuke/parse.ts";
import { neighborId, nodesInRect, selectionBounds, toggleId, upstreamIds } from "./nuke/select.ts";
import { buildScene, type DagNode, type DagScene } from "./nuke/scene.ts";
import { measureDagText } from "./gpu/textAtlas.ts";

const DRAG_THRESHOLD_PX = 4;

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
  const cameras = useRef(new Map<string, Camera>());
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [gpuState, setGpuState] = useState<"loading" | "ready" | "drawn" | "error">("loading");
  const [path, setPath] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const endGesture = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

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
    cameras.current.clear();
    fittedScene.current = null;
    selectedIdsRef.current = [];
    setSelectedIds((ids) => (ids.length === 0 ? ids : []));
    rendererRef.current?.setSelected([]);
    setMarquee(null);
    setPath([]);
  }, [props.script]);

  useEffect(() => () => endGesture.current?.(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || parsed.error) return;
    let cancelled = false;
    const rendererPromise = createNukeRenderer(canvas, {
      onError: (message) => {
        setGpuError(message);
        setGpuState("error");
      },
    });
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
    renderer.setSelected(selectedIdsRef.current);
    const paint = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      if (fittedScene.current !== current.id) {
        if (fittedScene.current) cameras.current.set(fittedScene.current, { ...cameraRef.current });
        cameraRef.current = cameras.current.get(current.id) ?? fitCamera(current.bounds, rect.width, rect.height);
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

  function applySelection(scene: DagScene, ids: readonly string[]) {
    const next = [...ids];
    selectedIdsRef.current = next;
    setSelectedIds(next);
    rendererRef.current?.setSelected(next);
    rendererRef.current?.draw();
    const lastId = next.at(-1);
    const node = lastId ? (scene.nodes.find((item) => item.id === lastId) ?? null) : null;
    props.onSelectNode?.(node);
  }

  function clearSelection() {
    selectedIdsRef.current = [];
    setSelectedIds((ids) => (ids.length === 0 ? ids : []));
    rendererRef.current?.setSelected([]);
    rendererRef.current?.draw();
    props.onSelectNode?.(null);
  }

  function selectedNode(): DagNode | null {
    if (!current) return null;
    const lastId = selectedIdsRef.current.at(-1);
    if (!lastId) return null;
    return current.nodes.find((node) => node.id === lastId) ?? null;
  }

  function openNode(node: DagNode | null) {
    const next = enterGroupPath(path, node);
    if (!next) return;
    clearSelection();
    setPath(next);
  }

  function zoomBy(factor: number) {
    const wrap = wrapRef.current;
    const renderer = rendererRef.current;
    if (!wrap || !renderer) return;
    const rect = wrap.getBoundingClientRect();
    const camera = cameraRef.current;
    const sx = rect.width / 2;
    const sy = rect.height / 2;
    const dagX = camera.x + sx / camera.zoom;
    const dagY = camera.y + sy / camera.zoom;
    const zoom = clamp(camera.zoom * factor, 0.05, 8);
    cameraRef.current = { x: dagX - sx / zoom, y: dagY - sy / zoom, zoom };
    renderer.setCamera(cameraRef.current);
    renderer.draw();
  }

  function clientToDag(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    return {
      x: camera.x + (clientX - rect.left) / camera.zoom,
      y: camera.y + (clientY - rect.top) / camera.zoom,
    };
  }

  function eventToDag(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    return clientToDag(event.clientX, event.clientY);
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !current) return;
    if (event.button !== 0 && event.button !== 1) return;
    wrap.focus({ preventScroll: true });
    if (event.button === 1) event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...cameraRef.current };
    const scene = current;
    const pan = event.button === 1 || event.altKey;
    let dragged = false;
    let settled = false;
    endGesture.current?.();

    const stop = () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      if (endGesture.current === stop) endGesture.current = null;
    };
    endGesture.current = stop;

    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (pan) {
        cameraRef.current = {
          x: origin.x - dx / origin.zoom,
          y: origin.y - dy / origin.zoom,
          zoom: origin.zoom,
        };
        draw();
        return;
      }
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
      dragged = true;
      const rect = wrap!.getBoundingClientRect();
      setMarquee({
        left: Math.min(startX, ev.clientX) - rect.left,
        top: Math.min(startY, ev.clientY) - rect.top,
        width: Math.abs(ev.clientX - startX),
        height: Math.abs(ev.clientY - startY),
      });
    }

    function up(ev: PointerEvent) {
      if (settled) return;
      settled = true;
      if (ev.type === "pointerup" && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD_PX) {
        dragged = true;
      }
      stop();
      setMarquee(null);
      if (pan || ev.type === "pointercancel") return;
      if (!dragged) {
        const dag = clientToDag(startX, startY);
        const hit = dag ? hitTest(scene, dag.x, dag.y) : null;
        if (!hit) {
          applySelection(scene, []);
          return;
        }
        if (ev.ctrlKey || ev.metaKey) {
          applySelection(scene, upstreamIds(scene, hit.id));
          return;
        }
        if (ev.shiftKey) {
          applySelection(scene, toggleId(selectedIdsRef.current, hit.id));
          return;
        }
        applySelection(scene, [hit.id]);
        return;
      }
      const start = clientToDag(startX, startY);
      const end = clientToDag(ev.clientX, ev.clientY);
      if (!start || !end) return;
      const picked = nodesInRect(scene, rectFromPoints(start, end)).map((node) => node.id);
      if (ev.shiftKey) applySelection(scene, unionIds(selectedIdsRef.current, picked));
      else applySelection(scene, picked);
    }

    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  return (
    <div
      ref={wrapRef}
      className={props.className}
      data-gpu={gpuState}
      tabIndex={0}
      onKeyDownCapture={(event) => {
        if (!current || !wrapRef.current) return;
        if (isEnterGroupKey(event)) {
          event.preventDefault();
          openNode(selectedNode());
          return;
        }
        if (isLeaveGroupKey(event)) {
          if (path.length === 0) return;
          event.preventDefault();
          clearSelection();
          setPath(leaveGroupPath(path));
          return;
        }
        if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a") {
          event.preventDefault();
          applySelection(
            current,
            current.nodes.map((node) => node.id),
          );
          return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const lastId = selectedIdsRef.current.at(-1);
          if (!lastId) return;
          event.preventDefault();
          const next = neighborId(current, lastId, event.key === "ArrowUp" ? "up" : "down");
          if (!next) return;
          applySelection(current, [next]);
          return;
        }
        if (event.key === "f" || event.key === "F") {
          const rect = wrapRef.current.getBoundingClientRect();
          const chosen = new Set(selectedIdsRef.current);
          const focus = selectionBounds(current.nodes.filter((node) => chosen.has(node.id))) ?? current.bounds;
          cameraRef.current = fitCamera(focus, rect.width, rect.height);
          draw();
          return;
        }
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          zoomBy(1.25);
          return;
        }
        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          zoomBy(1 / 1.25);
        }
      }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#555555",
        outline: "none",
        overflow: "hidden",
        ...props.style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
        onPointerDown={onCanvasPointerDown}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
        onDoubleClick={(event) => {
          if (!current) return;
          const dag = eventToDag(event);
          if (!dag) return;
          const hit = hitTest(current, dag.x, dag.y);
          openNode(hit);
        }}
      />
      {marquee ? (
        <div
          style={{
            position: "absolute",
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
            border: "1px solid #f2f2f2",
            background: "rgba(255,255,255,0.08)",
            pointerEvents: "none",
          }}
        />
      ) : null}
      <nav
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          display: "flex",
          gap: 4,
          alignItems: "center",
          padding: "4px 8px",
          background: "rgba(20,20,20,0.88)",
          borderRadius: 4,
          font: "12px Verdana, sans-serif",
          color: "#ddd",
        }}
      >
        {crumbs.map((crumb, index) => (
          <span key={crumb.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {index > 0 ? <span style={{ color: "#777" }}>›</span> : null}
            <button
              type="button"
              onClick={() => {
                clearSelection();
                setPath(path.slice(0, index));
              }}
              style={{
                background: "transparent",
                color: index === crumbs.length - 1 ? "#fff" : "#8ec8ff",
                border: 0,
                padding: "2px 2px",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>
      {current?.nodes.some((node) => node.id === selectedIds.at(-1) && node.graph) ? (
        <p
          style={{
            position: "absolute",
            left: 8,
            bottom: 8,
            margin: 0,
            color: "#9a9a9a",
            font: "12px Verdana, sans-serif",
            pointerEvents: "none",
          }}
        >
          Ctrl+Enter to open
        </p>
      ) : null}
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

function fitCamera(
  rect: { x: number; y: number; w: number; h: number },
  cssWidth: number,
  cssHeight: number,
): Camera {
  const padding = 48;
  const width = Math.max(rect.w, 1);
  const height = Math.max(rect.h, 1);
  const zoom = clamp(
    Math.min((cssWidth - padding * 2) / width, (cssHeight - padding * 2) / height),
    0.05,
    2,
  );
  return {
    x: rect.x + rect.w / 2 - cssWidth / zoom / 2,
    y: rect.y + rect.h / 2 - cssHeight / zoom / 2,
    zoom,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(min, value));
}

function unionIds(ids: readonly string[], extra: readonly string[]): string[] {
  const seen = new Set(ids);
  const next = [...ids];
  for (const id of extra) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
