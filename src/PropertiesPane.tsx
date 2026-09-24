import { useEffect, useRef, useState } from "react";
import type { JSX, PointerEvent as ReactPointerEvent } from "react";
import "./properties.css";
import { PrimatteBoard } from "./PrimatteBoard.tsx";
import { ShuffleBoard } from "./ShuffleBoard.tsx";
import type { KnobKind } from "./nuke/knobTypes.ts";
import {
  axisLabels,
  chipColor,
  componentCount,
  curvePoints,
  formatMark,
  parseLookupCurves,
  type LookupCurve,
  gangsUniform,
  matrixRows,
  numericParts,
  showsSlider,
  sliderFraction,
  sliderLabeled,
  sliderMarks,
  swatchColor,
  type PropertyControl,
  type PropertyPanel,
} from "./nuke/properties.ts";

const PROPERTIES_DEFAULT = 520;
const PROPERTIES_MIN = 280;
const PROPERTIES_MAX = 960;
const PROPERTIES_COLLAPSE = 96;

/** Drag left to widen. Dragging under the collapse threshold shuts the pane and keeps the last width. */
export function resizeProperties(startWidth: number, startX: number, clientX: number): { width: number; collapsed: boolean } {
  const next = startWidth + (startX - clientX);
  if (next < PROPERTIES_COLLAPSE) return { width: Math.max(startWidth, PROPERTIES_MIN), collapsed: true };
  return { width: Math.min(PROPERTIES_MAX, Math.max(PROPERTIES_MIN, next)), collapsed: false };
}

export function PropertiesPane(props: { panel: PropertyPanel | null; onClose?: () => void }): JSX.Element {
  const panel = props.panel;
  const identity = panel ? `${panel.className}\0${panel.name}` : "";
  const [tabState, setTabState] = useState<{ identity: string; id: string | null }>({ identity: "", id: null });
  const tabId = tabState.identity === identity ? tabState.id : null;
  const [width, setWidth] = useState(PROPERTIES_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  function onGripDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = collapsed ? 0 : widthRef.current;
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      const next = resizeProperties(startWidth, startX, ev.clientX);
      setCollapsed(next.collapsed);
      if (!next.collapsed) setWidth(next.width);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  const selected = panel?.tabs.find((tab) => tab.id === tabId) ?? panel?.tabs[0];
  return (
    <div className={collapsed ? "nk-props-slot collapsed" : "nk-props-slot"} style={{ width: collapsed ? 10 : width }}>
      <div
        className="nk-props-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize properties"
        aria-valuenow={collapsed ? 0 : width}
        title={collapsed ? "Drag to open properties" : "Drag to resize properties"}
        onPointerDown={onGripDown}
        onDoubleClick={() => setCollapsed((value) => !value)}
      />
      {collapsed || !panel || !selected ? (
        collapsed ? null : <aside className="nk-props"><p className="nk-props-empty">Select a node.</p></aside>
      ) : (
    <aside className="nk-props">
      <div className="nk-props-head">
        <span className="nk-swatch" style={{ background: panel.color }} />
        <input className="nk-name" value={panel.name} readOnly aria-label="Node name" />
        {props.onClose ? (
          <button type="button" className="nk-props-close" onClick={props.onClose} aria-label="Close properties">
            ×
          </button>
        ) : null}
      </div>
      <div className="nk-tabs" role="tablist">
        {panel.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === selected?.id}
            onClick={() => setTabState({ identity, id: tab.id })}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <div className="nk-body" role="tabpanel">
        {panel.shuffle && selected?.id === panel.tabs[0]?.id ? <ShuffleBoard model={panel.shuffle} /> : null}
        {panel.primatte && selected?.id === panel.tabs[0]?.id ? <PrimatteBoard model={panel.primatte} /> : null}
        {selected ? rowsOf(selected.controls).map((row) => (
          <div className="nk-row" key={row.map((control) => control.id).join("|")}>
            {row.map((control) => (
              <ControlView key={control.id} control={control} />
            ))}
          </div>
        )) : null}
      </div>
    </aside>
      )}
    </div>
  );
}

function rowsOf(controls: PropertyControl[]): PropertyControl[][] {
  const rows: PropertyControl[][] = [];
  for (const control of controls) {
    if (control.kind === "text" && !control.label.trim()) {
      rows.push([control]);
      continue;
    }
    const previous = rows[rows.length - 1];
    const blocked = previous?.some((item) => item.kind === "text" && !item.label.trim());
    if (!control.startLine && previous && !blocked) previous.push(control);
    else rows.push([control]);
  }
  return rows;
}

function ControlView(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  if (control.kind === "help") {
    return <button type="button" className="nk-help" disabled title={control.tooltip || control.label}>?</button>;
  }
  if (control.kind === "text") {
    if (!control.label.trim()) return <hr className="nk-rule" />;
    return <span className="nk-lab" title={control.tooltip}>{control.label}</span>;
  }
  if (control.kind === "colorChip") {
    const swatch = chipColor(control.value) ?? "#000000";
    return (
      <span className="nk-channels" title={control.tooltip}>
        <button type="button" className="nk-swatch nk-chip" disabled style={{ background: swatch }} aria-label={control.value || "color"} />
        {control.label ? <span>{control.label}</span> : null}
      </span>
    );
  }
  if (control.kind === "spacer" || control.kind === "vspacer") return <div className="nk-gap" />;
  if ((control.kind === "transform2d" || control.kind === "axis") && !control.value.trim()) return <></>;
  if (isCheck(control.kind)) {
    return (
      <label className="nk-check" title={control.tooltip}>
        <span className={control.checked ? "nk-box on" : "nk-box"}>{control.checked ? "×" : ""}</span>
        {control.label}
      </label>
    );
  }
  if (isButton(control.kind)) {
    return <button type="button" disabled>{control.label || control.value || "Run"}</button>;
  }
  return (
    <label className="nk-field" title={control.tooltip}>
      {control.label ? <span className="nk-lab">{control.label}</span> : null}
      <Widget control={control} />
    </label>
  );
}

function Widget(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  if (control.kind === "keyer") return <KeyerRange value={control.value} />;
  if (control.kind === "lookupCurves") {
    const curves = parseLookupCurves(control.value);
    if (curves.some((curve) => curve.name === "sat" || curve.name === "sat_thrsh")) return <HuePlot curves={curves} />;
    return <CurveView value={control.value} />;
  }
  if (control.kind === "histogram") return <HistogramView value={control.value} />;
  if (isChannels(control.kind)) return <Channels control={control} />;
  if (control.kind === "bitmask" || control.kind === "dynamicBitmask") return <Bits control={control} />;
  if (control.kind === "radio") return <Radios control={control} />;
  if (isMenu(control.kind)) return <Menu control={control} />;
  if (control.kind === "freetype") {
    const family = control.value || "Verdana";
    const options = control.options.length > 0 ? control.options : [family];
    const optionLabels = control.optionLabels.length === options.length ? control.optionLabels : options;
    return (
      <span className="nk-channels">
        <Menu control={{ ...control, value: family, options, optionLabels }} />
        <button type="button" className="nk-font-style" disabled>B</button>
        <button type="button" className="nk-font-style nk-italic" disabled>I</button>
      </span>
    );
  }
  if (control.kind === "file" || control.kind === "cachedFile") {
    return (
      <span className="nk-channels">
        <input value={control.value} readOnly />
        <button type="button" disabled aria-label="Browse">…</button>
      </span>
    );
  }
  if (isColor(control.kind) || control.kind === "eyedropper") {
    const parts = numericParts(control.value);
    const swatch = swatchColor(parts.length >= 3 ? parts.slice(0, 3).join(" ") : control.value) ?? gangedSwatch(control.value) ?? "#000000";
    const count = control.kind === "acolor" || control.kind === "eyedropper" ? 4 : 3;
    return (
      <span className="nk-channels">
        <Numbers control={control} trailing={false} />
        {swatch ? <span className="nk-swatch nk-chip" style={{ background: swatch }} /> : null}
        <button type="button" className="nk-wheel" disabled aria-label="Color picker" />
        <span className="nk-dim">{count}</span>
        <CurveButton />
      </span>
    );
  }
  if (isMultiline(control.kind) || control.value.includes("\n") || control.value.length > 160) {
    return <textarea className={control.name === "label" ? "nk-note-label" : undefined} value={control.value} readOnly />;
  }
  if (isNumeric(control.kind)) return <Numbers control={control} />;
  if (control.kind === "link") return <span className="nk-note">{control.value || "linked"}</span>;
  return <input value={control.value} readOnly type={control.secret ? "password" : "text"} />;
}

function Channels(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  const value = control.value || "none";
  const layer = control.kind === "channelMask" || control.kind === "inputChannelMask" || /^(rgba|rgb|alpha|all)$/i.test(value);
  const enabled = value !== "none" && value !== "-" && value !== "";
  return (
    <span className="nk-channels">
      {layer ? null : <span className={enabled ? "nk-box on" : "nk-box"}>{enabled ? "×" : ""}</span>}
      <Menu control={{ ...control, value }} />
      {layer ? (
        <>
          <Channel on={control.channels.r} name="r" text="red" />
          <Channel on={control.channels.g} name="g" text="green" />
          <Channel on={control.channels.b} name="b" text="blue" />
          {value === "rgb" ? null : <Channel on={control.channels.a} name="a" text="alpha" />}
        </>
      ) : null}
      <button type="button" className="nk-eq" disabled aria-label="Set channels">=</button>
    </span>
  );
}

function Menu(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  const options = control.options.length > 0 ? control.options : [control.value];
  return (
    <select value={control.value} disabled>
      {options.map((option, index) => (
        <option key={`${option}-${index}`} value={option}>{control.optionLabels[index] || option || " "}</option>
      ))}
    </select>
  );
}

function Bits(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  if (control.options.length === 0) return <input value={control.value} readOnly />;
  return (
    <span className="nk-channels">
      {control.options.map((option, index) => (
        <label key={option} className="nk-check">
          <input type="checkbox" checked={bitOn(control.value, option, index)} readOnly disabled />
          {control.optionLabels[index] || option}
        </label>
      ))}
    </span>
  );
}

function Radios(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  const options = control.options.length > 0 ? control.options : [control.value];
  return (
    <span className="nk-channels">
      {options.map((option, index) => (
        <label key={option} className="nk-check">
          <input type="radio" checked={control.value === option} readOnly disabled />
          {control.optionLabels[index] || option}
        </label>
      ))}
    </span>
  );
}

const COMPACT_ARRAY = new Set(["postage_stamp_frame", "note_font_size", "lifetimeStart", "lifetimeEnd"]);

function Numbers(props: { control: PropertyControl; trailing?: boolean }): JSX.Element {
  const control = props.control;
  const trailing = props.trailing !== false;
  const matrix = control.kind === "array" || control.kind === "multiarray" ? matrixRows(control.value) : null;
  if (matrix) return <Matrix rows={matrix} />;
  const parts = numericParts(control.value);
  const shown = parts.length > 0 ? parts : [control.value];
  const axes = axisLabels(control.kind);
  if (control.kind === "positionVector") return <VectorEnds parts={shown} />;
  const gang = gangsUniform(control.kind) && (shown.length <= 1 || shown.every((part) => part === shown[0]));
  const fields = axes && !gang ? axes.map((_, index) => shown[index] ?? shown[0] ?? "") : gang || !axes ? (gang ? [shown[0] ?? control.value] : shown) : shown;
  const labels = axes && !gang ? axes : [];
  const single = Number(fields.length === 1 ? fields[0] : Number.NaN);
  const arraySlider = control.kind === "array" && !COMPACT_ARRAY.has(control.name);
  const ranged = (showsSlider(control.kind) || arraySlider) && control.min != null && control.max != null && control.max > control.min && Number.isFinite(single);
  const splitCount = axes?.length ?? componentCount(control.kind);
  const curve = trailing && (ranged || (axes != null && axes.length > 0) || gang);
  return (
    <span className="nk-channels">
      {fields.map((part, index) => (
        <span className="nk-channels" key={labels[index] ?? index}>
          {labels[index] ? <span className="nk-axis">{labels[index]}</span> : null}
          <input value={part} readOnly size={7} />
        </span>
      ))}
      {control.name === "postage_stamp_frame" ? <span className="nk-caption">Static Frame</span> : null}
      {ranged && control.min != null && control.max != null ? (
        <RangeSlider value={single} min={control.min} max={control.max} />
      ) : null}
      {trailing && gang && splitCount > 1 ? <span className="nk-dim">{splitCount}</span> : null}
      {curve ? <CurveButton /> : null}
    </span>
  );
}

function gangedSwatch(value: string): string | null {
  const parts = numericParts(value);
  if (parts.length !== 1) return null;
  const amount = Number(parts[0]);
  if (!Number.isFinite(amount)) return null;
  const unit = amount <= 1 ? amount : amount / 255;
  const byte = Math.max(0, Math.min(255, Math.round(unit * 255)));
  const hex = byte.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function CurveButton(): JSX.Element {
  return <button type="button" className="nk-anim" disabled aria-label="Animation curve">~</button>;
}

function VectorEnds(props: { parts: string[] }): JSX.Element {
  const from = ["x", "y", "z"].map((label, index) => ({ label, value: props.parts[index] ?? "" }));
  const to = ["x", "y", "z"].map((label, index) => ({ label, value: props.parts[index + 3] ?? "" }));
  return (
    <span className="nk-stack">
      <span className="nk-channels"><span className="nk-axis">from</span>{from.map((field) => <AxisField key={`f${field.label}`} label={field.label} value={field.value} />)}</span>
      <span className="nk-channels"><span className="nk-axis">to</span>{to.map((field) => <AxisField key={`t${field.label}`} label={field.label} value={field.value} />)}</span>
    </span>
  );
}

function AxisField(props: { label: string; value: string }): JSX.Element {
  return (
    <span className="nk-channels">
      <span className="nk-axis">{props.label}</span>
      <input value={props.value} readOnly size={7} />
    </span>
  );
}

function Matrix(props: { rows: string[][] }): JSX.Element {
  return (
    <span className="nk-matrix">
      {props.rows.map((row, rowIndex) => (
        <span className="nk-channels" key={rowIndex}>
          {row.map((cell, cellIndex) => (
            <input key={cellIndex} value={cell} readOnly size={4} />
          ))}
        </span>
      ))}
    </span>
  );
}

function RangeSlider(props: { value: number; min: number; max: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = 210;
    const height = 36;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const left = 4;
    const right = width - 4;
    const track = 7;
    ctx.strokeStyle = "#6a6a6a";
    ctx.beginPath();
    ctx.moveTo(left, track);
    ctx.lineTo(right, track);
    ctx.stroke();
    ctx.font = "9px Verdana, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const mark of sliderMarks(props.min, props.max)) {
      const x = left + sliderFraction(mark, props.min, props.max) * (right - left);
      const label = sliderLabeled(mark, props.min, props.max);
      ctx.fillStyle = "#8d8d8d";
      ctx.fillRect(x, track + 2, 1, label ? 4 : 2);
      if (!label) continue;
      ctx.fillStyle = "#b5b5b5";
      ctx.fillText(formatMark(mark), x, track + 8);
    }
    const x = left + sliderFraction(props.value, props.min, props.max) * (right - left);
    ctx.fillStyle = "#e6c36a";
    ctx.fillRect(x - 1.5, track - 5, 3, 10);
  }, [props.value, props.min, props.max]);
  return <canvas ref={ref} className="nk-slider" aria-hidden="true" />;
}

function HuePlot(props: { curves: LookupCurve[] }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const selected = props.curves[0]?.name ?? "";
  const active = props.curves.find((curve) => curve.name === selected);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = 340;
    const height = 210;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const left = 28;
    const right = width - 8;
    const top = 8;
    const bottom = height - 18;
    const x0 = 0;
    const x1 = 6;
    const y0 = 0;
    const y1 = 2;
    const sx = (x: number) => left + ((x - x0) / (x1 - x0)) * (right - left);
    const sy = (y: number) => bottom - ((y - y0) / (y1 - y0)) * (bottom - top);
    for (let x = left; x < right; x += 1) {
      const hue = ((x - left) / (right - left)) * 360;
      ctx.fillStyle = `hsl(${hue} 75% 32%)`;
      ctx.fillRect(x, top, 1, bottom - top);
    }
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 6; x += 1) {
      ctx.beginPath();
      ctx.moveTo(sx(x), top);
      ctx.lineTo(sx(x), bottom);
      ctx.stroke();
    }
    for (let y = 0; y <= 2; y += 0.5) {
      ctx.beginPath();
      ctx.moveTo(left, sy(y));
      ctx.lineTo(right, sy(y));
      ctx.stroke();
    }
    const level = active?.name === "sat_thrsh" ? 0 : 1;
    const points = active && active.points.length > 0 ? [...active.points].sort((a, b) => a[0] - b[0]) : [[0, level], [6, level]] as Array<[number, number]>;
    ctx.beginPath();
    ctx.strokeStyle = "#f2e04a";
    ctx.lineWidth = 1.5;
    points.forEach((point, index) => {
      const x = sx(point[0]);
      const y = sy(point[1]);
      if (index === 0) ctx.moveTo(sx(0), y);
      ctx.lineTo(x, y);
    });
    const last = points[points.length - 1];
    if (last) ctx.lineTo(sx(6), sy(last[1]));
    ctx.stroke();
    ctx.fillStyle = "#9dce55";
    ctx.font = "11px Verdana, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const y of [0, 0.5, 1, 1.5, 2]) ctx.fillText(String(y), left - 4, sy(y));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let x = 0; x <= 6; x += 1) ctx.fillText(String(x), sx(x), bottom + 3);
  }, [active, selected]);
  return (
    <div className="nk-hue">
      <div className="nk-hue-list">
        {props.curves.map((curve) => (
          <div key={curve.name} className={curve.name === selected ? "nk-hue-name on" : "nk-hue-name"}>{curve.name}</div>
        ))}
        <button type="button" disabled>reset</button>
      </div>
      <canvas ref={ref} className="nk-hue-plot" aria-label="Hue curves" />
    </div>
  );
}

function KeyerRange(props: { value: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const points = keyerEnds(props.value);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = 260;
    const height = 140;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    const [a, b, c, d] = points;
    const x0 = Math.min(0, a);
    const x1 = Math.max(1, d, c, b);
    const left = 8;
    const right = width - 8;
    const top = 8;
    const bottom = height - 16;
    const sx = (x: number) => left + ((x - x0) / (x1 - x0 || 1)) * (right - left);
    const sy = (y: number) => bottom - y * (bottom - top);
    ctx.strokeStyle = "#3cba3c";
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "#e23b3b";
    ctx.lineWidth = 1.5;
    const steps = 64;
    for (let index = 0; index <= steps; index += 1) {
      const x = x0 + ((x1 - x0) * index) / steps;
      const y = keyerOutput(x, a, b, c, d);
      if (index === 0) ctx.moveTo(sx(x), sy(y));
      else ctx.lineTo(sx(x), sy(y));
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f0d020";
    ctx.fillStyle = "#fff";
    ctx.font = "12px Verdana, sans-serif";
    ctx.textAlign = "center";
    const marks: Array<[string, number]> = [["A", a], ["B", b], ["C", c], ["D", d]];
    const used = new Map<number, number>();
    for (const [label, x] of marks) {
      const px = sx(x);
      const stack = used.get(Math.round(px)) ?? 0;
      used.set(Math.round(px), stack + 1);
      ctx.beginPath();
      ctx.moveTo(px, top + stack * 14);
      ctx.lineTo(px, bottom);
      ctx.stroke();
      ctx.fillText(label, px + (px > width - 24 ? -10 : 10), top + 12 + stack * 14);
    }
    ctx.font = "10px Verdana, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ddd";
    ctx.fillText(x0 === 0 ? "0.0000" : formatMark(x0), left, height - 2);
    ctx.textAlign = "right";
    ctx.fillText(formatMark(x1), right, height - 2);
  }, [props.value, points]);
  const labels = ["A", "B", "C", "D"] as const;
  return (
    <span className="nk-keyer">
      <span>
        <canvas ref={ref} className="nk-keyer-plot" aria-label="Keyer range" />
        <span className="nk-keyer-fields">
          {labels.map((label, index) => (
            <span className="nk-channels" key={label}>
              <span className="nk-axis">{label}</span>
              <input value={formatKey(points[index] ?? 0)} readOnly size={4} />
            </span>
          ))}
          <CurveButton />
        </span>
      </span>
      <span className="nk-keyer-side">
        <button type="button" className="nk-font-style" disabled aria-label="Add key">+</button>
        <button type="button" className="nk-font-style" disabled aria-label="Remove key">−</button>
        <CurveButton />
      </span>
    </span>
  );
}

function keyerEnds(value: string): [number, number, number, number] {
  const nums = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const a = nums[0] ?? 0;
  const b = nums[1] ?? 1;
  const c = nums[2] ?? b;
  const d = nums[3] ?? c;
  return [a, b, c, d];
}

function keyerOutput(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a) return 0;
  if (x < b) return b === a ? 1 : (x - a) / (b - a);
  if (x <= c) return 1;
  if (x < d) return d === c ? 0 : 1 - (x - c) / (d - c);
  return 0;
}

function formatKey(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function CurveView(props: { value: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const points = curvePoints(props.value);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || points.length < 2) return;
    const width = 220;
    const height = 80;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#111";
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sx = (x: number) => 8 + ((x - minX) / (maxX - minX || 1)) * (width - 16);
    const sy = (y: number) => height - 8 - ((y - minY) / (maxY - minY || 1)) * (height - 16);
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = sx(point[0]);
      const y = sy(point[1]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#8ec8ff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [props.value, points]);
  if (points.length < 2) return <textarea value={props.value} readOnly />;
  return <canvas ref={ref} className="nk-curve" aria-hidden="true" />;
}

function HistogramView(props: { value: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const bars = props.value.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter((value) => Number.isFinite(value)) ?? [];
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || bars.length < 2) return;
    const width = 220;
    const height = 64;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, width, height);
    const peak = Math.max(...bars.map((value) => Math.abs(value)), 1);
    const slot = width / bars.length;
    ctx.fillStyle = "#8ec8ff";
    bars.forEach((value, index) => {
      const h = (Math.abs(value) / peak) * (height - 8);
      ctx.fillRect(index * slot + 1, height - 4 - h, Math.max(1, slot - 2), h);
    });
  }, [props.value, bars]);
  if (bars.length < 2) return <input value={props.value} readOnly />;
  return <canvas ref={ref} className="nk-curve" aria-hidden="true" />;
}

function Channel(props: { on: boolean; name: "r" | "g" | "b" | "a"; text: string }): JSX.Element {
  return (
    <span className="nk-ch-wrap">
      <span className={props.on ? `nk-ch on ${props.name}` : `nk-ch ${props.name}`}>{props.on ? "×" : ""}</span>
      {props.text}
    </span>
  );
}

function bitOn(value: string, option: string, index: number): boolean {
  const text = value.trim();
  if (!text || text === "0" || text === "none") return false;
  const parts = text.split(/[\s,]+/);
  if (parts.includes(option)) return true;
  const flags = Number(text);
  if (Number.isInteger(flags) && flags > 1) return (flags & (1 << index)) !== 0;
  return false;
}

function isCheck(kind: KnobKind): boolean {
  return kind === "bool" || kind === "disable";
}

function isButton(kind: KnobKind): boolean {
  return kind === "pyscript" || kind === "script" || kind === "menu" || kind === "cancelExecution";
}

function isChannels(kind: KnobKind): boolean {
  return kind === "channel" || kind === "channelMask" || kind === "inputChannel" || kind === "inputChannelMask" || kind === "particleChannels";
}

function isMenu(kind: KnobKind): boolean {
  return (
    kind === "enumeration" ||
    kind === "cascadingEnumeration" ||
    kind === "editableEnumeration" ||
    kind === "pulldown" ||
    kind === "pypulldown" ||
    kind === "oneview" ||
    kind === "multiview" ||
    kind === "viewview" ||
    kind === "format" ||
    kind === "colorspace" ||
    kind === "list"
  );
}

function isColor(kind: KnobKind): boolean {
  return kind === "color" || kind === "acolor";
}

function isMultiline(kind: KnobKind): boolean {
  return (
    kind === "multiline" ||
    kind === "multilineEval" ||
    kind === "textEditor" ||
    kind === "blinkEditor" ||
    kind === "python" ||
    kind === "pluginPython" ||
    kind === "controlPointCollection" ||
    kind === "table" ||
    kind === "sceneGraph" ||
    kind === "usdSceneGraph" ||
    kind === "geoSelect" ||
    kind === "metadata"
  );
}

function isNumeric(kind: KnobKind): boolean {
  return (
    kind === "int" ||
    kind === "float" ||
    kind === "double" ||
    kind === "size" ||
    kind === "pixelAspect" ||
    kind === "array" ||
    kind === "xy" ||
    kind === "xyz" ||
    kind === "wh" ||
    kind === "bbox" ||
    kind === "uv" ||
    kind === "scale" ||
    kind === "vec2" ||
    kind === "vec3" ||
    kind === "vec4" ||
    kind === "range" ||
    kind === "box3" ||
    kind === "positionVector" ||
    kind === "keyer" ||
    kind === "transform2d" ||
    kind === "axis" ||
    kind === "simpleArray" ||
    kind === "resizableArray" ||
    kind === "multiarray" ||
    kind === "frameExtent"
  );
}
