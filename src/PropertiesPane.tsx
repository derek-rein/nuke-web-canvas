import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import "./properties.css";
import type { KnobKind } from "./nuke/knobTypes.ts";
import {
  componentCount,
  curvePoints,
  formatMark,
  numericParts,
  sliderFraction,
  sliderLabeled,
  sliderMarks,
  swatchColor,
  type PropertyControl,
  type PropertyPanel,
} from "./nuke/properties.ts";

export function PropertiesPane(props: { panel: PropertyPanel | null }): JSX.Element {
  const panel = props.panel;
  const identity = panel ? `${panel.className}\0${panel.name}` : "";
  const [tabState, setTabState] = useState<{ identity: string; id: string | null }>({ identity: "", id: null });
  const tabId = tabState.identity === identity ? tabState.id : null;
  if (!panel) return <aside className="nk-props"><p className="nk-props-empty">Select a node.</p></aside>;
  const selected = panel.tabs.find((tab) => tab.id === tabId) ?? panel.tabs[0];
  return (
    <aside className="nk-props">
      <div className="nk-props-head">
        <span className="nk-swatch" style={{ background: panel.color }} />
        <input className="nk-name" value={panel.name} readOnly aria-label="Node name" />
        <span className="nk-class">{panel.className}</span>
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
        {selected ? rowsOf(selected.controls).map((row) => (
          <div className="nk-row" key={row.map((control) => control.id).join("|")}>
            {row.map((control) => (
              <ControlView key={control.id} control={control} />
            ))}
          </div>
        )) : null}
      </div>
    </aside>
  );
}

function rowsOf(controls: PropertyControl[]): PropertyControl[][] {
  const rows: PropertyControl[][] = [];
  for (const control of controls) {
    const previous = rows[rows.length - 1];
    if (!control.startLine && previous && previous.every((item) => item.kind !== "text" && item.kind !== "help")) previous.push(control);
    else rows.push([control]);
  }
  return rows;
}

function ControlView(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  if (control.kind === "text" || control.kind === "help") {
    if (!control.label) return <hr className="nk-rule" />;
    return <p className="nk-head" title={control.tooltip}>{control.label}</p>;
  }
  if (control.kind === "spacer" || control.kind === "vspacer") return <div className="nk-gap" />;
  if (isCheck(control.kind)) {
    return (
      <label className="nk-check" title={control.tooltip}>
        <input type="checkbox" checked={control.checked} readOnly disabled />
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
  if (control.kind === "lookupCurves") return <CurveView value={control.value} />;
  if (control.kind === "histogram") return <HistogramView value={control.value} />;
  if (isChannels(control.kind)) return <Channels control={control} />;
  if (control.kind === "bitmask" || control.kind === "dynamicBitmask") return <Bits control={control} />;
  if (control.kind === "radio") return <Radios control={control} />;
  if (isMenu(control.kind)) return <Menu control={control} />;
  if (isColor(control.kind) || control.kind === "colorChip" || control.kind === "eyedropper") {
    const swatch = swatchColor(control.value);
    return (
      <span className="nk-channels">
        {swatch ? <span className="nk-swatch" style={{ background: swatch }} /> : null}
        <input value={control.value} readOnly />
      </span>
    );
  }
  if (isMultiline(control.kind) || control.value.includes("\n") || control.value.length > 160) {
    return <textarea value={control.value} readOnly />;
  }
  if (isNumeric(control.kind)) return <Numbers control={control} />;
  if (control.kind === "link") return <span className="nk-note">{control.value || "linked"}</span>;
  return <input value={control.value} readOnly type={control.secret ? "password" : "text"} />;
}

function Channels(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  const value = control.value || "none";
  const single = control.kind === "channel" || control.kind === "inputChannel";
  return (
    <span className="nk-channels">
      {single ? <input type="checkbox" checked={value !== "none" && value !== "-" && value !== ""} readOnly disabled /> : null}
      <Menu control={{ ...control, value }} />
      {single ? null : (
        <>
          <Channel on={control.channels.r} name="r" text="red" />
          <Channel on={control.channels.g} name="g" text="green" />
          <Channel on={control.channels.b} name="b" text="blue" />
          <Channel on={control.channels.a} name="a" text="alpha" />
        </>
      )}
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

function Numbers(props: { control: PropertyControl }): JSX.Element {
  const control = props.control;
  const parts = numericParts(control.value);
  const shown = parts.length > 0 ? parts : [control.value];
  const count = componentCount(control.kind);
  const uniform = shown.length <= 1 || shown.every((part) => part === shown[0]);
  const fields = uniform ? [shown[0] ?? control.value] : shown;
  const single = Number(fields.length === 1 ? fields[0] : Number.NaN);
  const ranged = control.min != null && control.max != null && control.max > control.min && Number.isFinite(single);
  return (
    <span className="nk-channels">
      {fields.map((part, index) => (
        <input key={index} value={part} readOnly size={7} />
      ))}
      {uniform && count > 1 ? <span className="nk-dim">{count}</span> : null}
      {ranged && control.min != null && control.max != null ? (
        <RangeSlider value={single} min={control.min} max={control.max} />
      ) : null}
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
    const left = 12;
    const right = width - 12;
    const track = 8;
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(left, track, right - left, 4);
    ctx.strokeStyle = "#111";
    ctx.strokeRect(left + 0.5, track + 0.5, right - left - 1, 3);
    ctx.font = "9px Verdana, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const mark of sliderMarks(props.min, props.max)) {
      const x = left + sliderFraction(mark, props.min, props.max) * (right - left);
      const label = sliderLabeled(mark, props.min, props.max);
      ctx.fillStyle = "#8d8d8d";
      ctx.fillRect(x, track + 5, 1, label ? 5 : 3);
      if (!label) continue;
      ctx.fillStyle = "#bdbdbd";
      ctx.fillText(formatMark(mark), x, track + 12);
    }
    const x = left + sliderFraction(props.value, props.min, props.max) * (right - left);
    ctx.fillStyle = "#f3f3f3";
    ctx.fillRect(x - 3, track - 3, 6, 10);
    ctx.strokeStyle = "#111";
    ctx.strokeRect(x - 3, track - 3, 6, 10);
  }, [props.value, props.min, props.max]);
  return <canvas ref={ref} className="nk-slider" aria-hidden="true" />;
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
  return <span className={props.on ? `nk-ch on ${props.name}` : `nk-ch ${props.name}`}>{props.on ? "×" : ""} {props.text}</span>;
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
