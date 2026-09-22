import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from "react";
import { createNukeRenderer, type NukeRenderer } from "./gpu/renderer.ts";
import { buildProperties } from "./nuke/properties.ts";
import { expressionScope } from "./nuke/scene.ts";
import { PropertiesPane } from "./PropertiesPane.tsx";
import type { Camera } from "./nuke/view.ts";
import { hitTest } from "./nuke/hitTest.ts";
import {
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
  minimapFrame,
  minimapToDag,
  needsMinimap,
  paintMinimap,
  panWithMinimap,
  viewRect,
  type MinimapFrame,
} from "./nuke/minimap.ts";
import { enterGroupPath, isEnterGroupKey, isLeaveGroupKey, leaveGroupPath } from "./nuke/navigate.ts";
import { replacementScript } from "./nuke/paste.ts";
import { parseNukeScript } from "./nuke/parse.ts";
import { neighborId, nodesInRect, selectionBounds, toggleId, upstreamIds } from "./nuke/select.ts";
import { buildScene, type DagNode, type DagScene } from "./nuke/scene.ts";
import { dragZoom, fitCamera, panCamera, wheelDeltaPixels, wheelZoom, zoomAbout } from "./nuke/view.ts";
import { measureDagText } from "./gpu/textAtlas.ts";

const DRAG_THRESHOLD_PX = 4;

export function NukeDag(props: {
  script: string;
  className?: string;
  style?: CSSProperties;
  onSelectNode?: (node: DagNode | null) => void;
  onScriptChange?: (script: string) => void;
  showProperties?: boolean;
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
  const [overrideScript, setOverrideScript] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const endGesture = useRef<(() => void) | null>(null);
  const buttonsDown = useRef(new Set<number>());
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const touchPointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
    midX: number;
    midY: number;
    camera: Camera;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<DagScene | null>(null);
  const refreshMinimapRef = useRef<() => void>(() => {});

  const script = overrideScript ?? props.script;
  const parsed = useMemo(() => {
    try {
      return { scene: buildScene(parseNukeScript(script), measureDagText), error: null as string | null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not parse the Nuke script";
      return { scene: null, error: message };
    }
  }, [script]);

  const current = parsed.scene ? sceneAt(parsed.scene, path) : null;
  const selectedId = selectedIds.at(-1);
  const selected = current && selectedId ? (current.nodes.find((node) => node.id === selectedId) ?? null) : null;
  const panel = props.showProperties ? (selected && current ? buildProperties(selected, expressionScope(selected, current)) : null) : null;
  const crumbs = useMemo(() => crumbsFor(parsed.scene, path), [parsed.scene, path]);
  sceneRef.current = current;
  // cameraRef is not state, so pan, zoom, fit, and map drag must call this beside renderer.draw().
  refreshMinimapRef.current = () => {
    const map = minimapRef.current;
    const wrap = wrapRef.current;
    const scene = sceneRef.current;
    if (!map || !wrap || !scene) {
      setMapVisible(false);
      return;
    }
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const camera = cameraRef.current;
    const visible = needsMinimap(scene.bounds, viewRect(camera, rect.width, rect.height));
    if (visible) paintMinimap(map, scene.nodes, scene.bounds, camera, rect.width, rect.height);
    setMapVisible(visible);
  };

  useEffect(() => {
    cameras.current.clear();
    fittedScene.current = null;
    setOverrideScript(null);
    cancelGesture();
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
    if (!renderer || !wrap || !canvas || !current) {
      if (!current) refreshMinimapRef.current();
      return;
    }
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
      refreshMinimapRef.current();
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
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const delta = wheelDeltaPixels(event.deltaY, event.deltaMode, rect.height);
      cameraRef.current = wheelZoom(cameraRef.current, sx, sy, delta);
      renderer.setCamera(cameraRef.current);
      renderer.draw();
      refreshMinimapRef.current();
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
    refreshMinimapRef.current();
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

  function cancelGesture() {
    endGesture.current?.();
    setMarquee(null);
    clearSelection();
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
    cancelGesture();
    setPath(next);
  }

  function zoomBy(factor: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const pointer = lastPointer.current;
    const rawX = pointer ? pointer.x - rect.left : rect.width / 2;
    const rawY = pointer ? pointer.y - rect.top : rect.height / 2;
    const inside = rawX >= 0 && rawY >= 0 && rawX <= rect.width && rawY <= rect.height;
    cameraRef.current = zoomAbout(
      cameraRef.current,
      inside ? rawX : rect.width / 2,
      inside ? rawY : rect.height / 2,
      cameraRef.current.zoom * factor,
    );
    draw();
  }

  function frameView() {
    if (!current || !wrapRef.current) return;
    const chosen = new Set(selectedIdsRef.current);
    const picked = current.nodes.filter((node) => chosen.has(node.id));
    const focus = selectionBounds(picked.length > 0 ? picked : current.nodes);
    if (!focus) return;
    const rect = wrapRef.current.getBoundingClientRect();
    cameraRef.current = fitCamera(focus, rect.width, rect.height);
    draw();
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
    touchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    buttonsDown.current.add(event.button);
    lastPointer.current = { x: event.clientX, y: event.clientY };
    wrap.focus({ preventScroll: true });
    if (event.button === 1 || event.altKey || event.pointerType === "touch") event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    if (touchPointers.current.size >= 2) {
      beginPinch(canvas);
      const pointerId = event.pointerId;
      const release = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        touchPointers.current.delete(pointerId);
        if (touchPointers.current.size < 2) pinchRef.current = null;
        canvas.removeEventListener("pointerup", release);
        canvas.removeEventListener("pointercancel", release);
      };
      canvas.addEventListener("pointerup", release);
      canvas.addEventListener("pointercancel", release);
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { ...cameraRef.current };
    const scene = current;
    const rect = canvas.getBoundingClientRect();
    const anchorSx = startX - rect.left;
    const anchorSy = startY - rect.top;
    const chordZoom = buttonsDown.current.has(0) && buttonsDown.current.has(1);
    const altMiddleZoom = event.button === 1 && event.altKey;
    const zoom = chordZoom || altMiddleZoom;
    const pan = !zoom && (event.button === 1 || (event.button === 0 && event.altKey) || event.pointerType === "touch");
    const frameOnRelease = event.button === 1 && !event.altKey && !chordZoom;
    let dragged = false;
    let pinched = false;
    let settled = false;
    endGesture.current?.();
    setMarquee(null);

    const stop = () => {
      settled = true;
      touchPointers.current.delete(event.pointerId);
      if (touchPointers.current.size < 2) pinchRef.current = null;
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      if (endGesture.current === stop) endGesture.current = null;
    };
    endGesture.current = stop;

    function move(ev: PointerEvent) {
      if (settled) return;
      touchPointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      lastPointer.current = { x: ev.clientX, y: ev.clientY };
      if (touchPointers.current.size >= 2) {
        if (!pinchRef.current && canvas) beginPinch(canvas);
        pinched = true;
        applyPinch();
        setMarquee(null);
        return;
      }
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragged = true;
      if (zoom) {
        cameraRef.current = dragZoom(origin, anchorSx, anchorSy, dx);
        draw();
        return;
      }
      if (pan) {
        cameraRef.current = panCamera(origin, dx, dy);
        draw();
        return;
      }
      if (!dragged) return;
      const box = wrap!.getBoundingClientRect();
      setMarquee({
        left: Math.min(startX, ev.clientX) - box.left,
        top: Math.min(startY, ev.clientY) - box.top,
        width: Math.abs(ev.clientX - startX),
        height: Math.abs(ev.clientY - startY),
      });
    }

    function up(ev: PointerEvent) {
      buttonsDown.current.delete(ev.button);
      if (settled) return;
      settled = true;
      if (ev.type === "pointerup" && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD_PX) {
        dragged = true;
      }
      stop();
      setMarquee(null);
      if (zoom || pinched || ev.type === "pointercancel") return;
      if (pan) {
        if (frameOnRelease && !dragged) frameView();
        return;
      }
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

  function beginPinch(canvas: HTMLCanvasElement) {
    const points = [...touchPointers.current.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return;
    const rect = canvas.getBoundingClientRect();
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: cameraRef.current.zoom,
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
      camera: { ...cameraRef.current },
    };
  }

  function applyPinch() {
    const origin = pinchRef.current;
    const points = [...touchPointers.current.values()];
    const a = points[0];
    const b = points[1];
    if (!origin || !a || !b) return;
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    cameraRef.current = zoomAbout(origin.camera, origin.midX, origin.midY, origin.zoom * (distance / origin.distance));
    draw();
  }

  function onMinimapPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const map = minimapRef.current;
    const wrap = wrapRef.current;
    const scene = sceneRef.current;
    if (!map || !wrap || !scene) return;
    event.preventDefault();
    event.stopPropagation();
    wrap.focus({ preventScroll: true });
    const frame = minimapFrame(scene.bounds);
    if (!(frame.scale > 0) || !Number.isFinite(frame.scale)) return;
    const measured = map.getBoundingClientRect();
    const mapRect = { left: measured.left, top: measured.top, width: measured.width, height: measured.height };
    const origin = { ...cameraRef.current };
    const start = dagOnMap(mapRect, frame, event.clientX, event.clientY);
    let settled = false;
    endGesture.current?.();

    const stop = () => {
      settled = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (endGesture.current === stop) endGesture.current = null;
    };
    endGesture.current = stop;

    function move(ev: PointerEvent) {
      if (settled) return;
      const dag = dagOnMap(mapRect, frame, ev.clientX, ev.clientY);
      cameraRef.current = panWithMinimap(origin, start, dag);
      draw();
    }

    function up() {
      if (settled) return;
      settled = true;
      stop();
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div
      className={[props.className, "nk-shell"].filter(Boolean).join(" ")}
      onPaste={(event) => {
        const next = replacementScript(event.clipboardData.getData("text/plain"));
        if (!next) return;
        event.preventDefault();
        event.stopPropagation();
        setOverrideScript(next);
        cancelGesture();
        setPath([]);
        clearSelection();
        props.onScriptChange?.(next);
      }}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        background: "#3c3c3c",
        ...props.style,
        display: "flex",
        position: "relative",
        overflow: "hidden",
      }}
    >
    <div
      ref={wrapRef}
      data-gpu={gpuState}
      tabIndex={0}
      onPointerMove={(event) => {
        lastPointer.current = { x: event.clientX, y: event.clientY };
      }}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
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
          cancelGesture();
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
          event.preventDefault();
          frameView();
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
        flex: "1 1 auto",
        minWidth: 0,
        height: "100%",
        outline: "none",
        overflow: "hidden",
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
                cancelGesture();
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
      <canvas
        ref={minimapRef}
        draggable={false}
        onPointerDown={onMinimapPointerDown}
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          width: MINIMAP_WIDTH,
          height: MINIMAP_HEIGHT,
          display: mapVisible ? "block" : "none",
          touchAction: "none",
        }}
      />
      {parsed.error || gpuError ? (
        <p style={{ position: "absolute", inset: 48, margin: 0, color: "#ddd", font: "12px Verdana, sans-serif" }}>
          {parsed.error ?? gpuError}
        </p>
      ) : null}
    </div>
    {props.showProperties ? <PropertiesPane panel={panel} onClose={clearSelection} /> : null}
    </div>
  );
}

function dagOnMap(
  rect: { left: number; top: number; width: number; height: number },
  frame: MinimapFrame,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const localX = rect.width > 0 ? ((clientX - rect.left) / rect.width) * frame.width : 0;
  const localY = rect.height > 0 ? ((clientY - rect.top) / rect.height) * frame.height : 0;
  return minimapToDag(frame, localX, localY);
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
