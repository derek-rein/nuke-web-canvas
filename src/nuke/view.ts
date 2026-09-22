export type Camera = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const FIT_MAX_ZOOM = 4;

const WHEEL_SENSITIVITY = 0.0015;
const DRAG_ZOOM_SENSITIVITY = 0.004;

export function zoomAbout(camera: Camera, sx: number, sy: number, nextZoom: number): Camera {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const dagX = camera.x + sx / camera.zoom;
  const dagY = camera.y + sy / camera.zoom;
  return { x: dagX - sx / zoom, y: dagY - sy / zoom, zoom };
}

export function wheelZoom(camera: Camera, sx: number, sy: number, deltaY: number): Camera {
  return zoomAbout(camera, sx, sy, camera.zoom * Math.exp(-deltaY * WHEEL_SENSITIVITY));
}

/** Alt+middle-drag and left+middle-drag: right zooms in, left zooms out, about the press point. */
export function dragZoom(origin: Camera, anchorSx: number, anchorSy: number, dx: number): Camera {
  return zoomAbout(origin, anchorSx, anchorSy, origin.zoom * Math.exp(dx * DRAG_ZOOM_SENSITIVITY));
}

export function panCamera(origin: Camera, dx: number, dy: number): Camera {
  return {
    x: origin.x - dx / origin.zoom,
    y: origin.y - dy / origin.zoom,
    zoom: origin.zoom,
  };
}

export function fitCamera(
  rect: { x: number; y: number; w: number; h: number },
  cssWidth: number,
  cssHeight: number,
): Camera {
  const padding = 48;
  const width = Math.max(rect.w, 1);
  const height = Math.max(rect.h, 1);
  const zoom = clamp(
    Math.min((cssWidth - padding * 2) / width, (cssHeight - padding * 2) / height),
    MIN_ZOOM,
    FIT_MAX_ZOOM,
  );
  return {
    x: rect.x + rect.w / 2 - cssWidth / zoom / 2,
    y: rect.y + rect.h / 2 - cssHeight / zoom / 2,
    zoom,
  };
}

export function wheelDeltaPixels(deltaY: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * pageSize;
  return deltaY;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(min, value));
}
