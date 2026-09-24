import type { JSX } from "react";
import { primatteModes, type PrimatteModel } from "./nuke/primatte.ts";

export function PrimatteBoard(props: { model: PrimatteModel }): JSX.Element {
  const model = props.model;
  const [x, y, r, t] = model.crop;
  return (
    <div className="nk-primatte">
      <MenuRow label="foreground" value={model.foreground} />
      <MenuRow label="background" value={model.background} />
      <div className="nk-row">
        <span className="nk-lab">crop</span>
        <Axis label="x" value={x} />
        <Axis label="y" value={y} />
        <Axis label="r" value={r} />
        <Axis label="t" value={t} />
        <button type="button" className="nk-dim" disabled>wh</button>
        <button type="button" className="nk-anim" disabled aria-label="Animation curve">~</button>
      </div>
      <div className="nk-row">
        <span className="nk-lab">mask</span>
        <span className="nk-box" />
        <select disabled value={model.mask}><option>{model.mask}</option></select>
        <button type="button" className="nk-eq" disabled>=</button>
        <Check label="invert" checked={model.invertMask} />
      </div>

      <Section title="Initialize" />
      <div className="nk-row">
        <span className="nk-lab">algorithm</span>
        <select disabled value={model.algorithm}><option>{model.algorithm}</option></select>
        <button type="button" disabled>Reset</button>
        <button type="button" disabled>Auto-Compute</button>
        <Check label="viewer" checked={false} />
      </div>

      <Section title="Degrain" />
      <div className="nk-row">
        <span className="nk-lab">type</span>
        <select disabled value={model.graintype}><option>{model.graintype}</option></select>
      </div>
      <div className="nk-row">
        <span className="nk-lab">tolerance</span>
        <input readOnly value={String(model.tolerance)} size={4} />
        <LogTrack value={model.tolerance} min={0.01} max={1} marks={["0.01", "0.1", "1"]} />
      </div>

      <Section title="Actions" />
      <div className="nk-row">
        <span className="nk-lab">operation</span>
        <select disabled value={model.mode}>
          {primatteModes().map((mode) => <option key={mode}>{mode}</option>)}
        </select>
        <button type="button" className="nk-font-style" disabled aria-label="Previous operation">◀</button>
        <button type="button" className="nk-font-style" disabled aria-label="Next operation">▶</button>
        <button type="button" className="nk-eyedrop" disabled aria-label="Pick color" />
      </div>
      <div className="nk-row">
        <span className="nk-lab" />
        <Check label="adjust lighting" checked={model.adjustLighting} />
        <Check label="hybrid render" checked={model.hybridRender} />
      </div>
      <div className="nk-twirly">▶ Adjust Lighting</div>
      <div className="nk-twirly">▶ Hybrid Matte</div>
      <div className="nk-twirly">▶ Fine Tuning</div>

      <Section title="Spill Process" />
      <div className="nk-row">
        <span className="nk-lab">replace with</span>
        <select disabled value={model.spillProcess}><option>{model.spillProcess}</option></select>
      </div>
      <div className="nk-row">
        <span className="nk-lab">replace color</span>
        <input readOnly value={String(model.replaceColor)} size={4} />
        <LogTrack value={model.replaceColor} min={0.01} max={1} marks={["0.01", "0.1", "1"]} />
        <span className="nk-swatch nk-chip" style={{ background: gray(model.replaceColor) }} />
        <button type="button" className="nk-wheel" disabled aria-label="Color picker" />
        <span className="nk-dim">3</span>
      </div>
      <div className="nk-row">
        <span className="nk-lab">defocus</span>
        <input readOnly value={String(model.defocus)} size={4} />
        <LogTrack value={model.defocus} min={0} max={9000} marks={["0", "1", "10", "100", "9000"]} />
        <span className="nk-dim">2</span>
      </div>

      <Section title="Output" />
      <div className="nk-row">
        <span className="nk-lab">output mode</span>
        <select disabled value={model.outputMode}><option>{model.outputMode}</option></select>
      </div>
      <div className="nk-row">
        <span className="nk-lab">output</span>
        <select disabled value={model.output}><option>{model.output}</option></select>
        <Swatch name="r" text="red" />
        <Swatch name="g" text="green" />
        <Swatch name="b" text="blue" />
        <Swatch name="a" text="alpha" />
        <select disabled value="rgba.alpha"><option>rgba.alpha</option></select>
        <button type="button" className="nk-eq" disabled>=</button>
      </div>
    </div>
  );
}

function Section(props: { title: string }): JSX.Element {
  return <div className="nk-section"><span>{props.title}</span><hr /></div>;
}

function MenuRow(props: { label: string; value: string }): JSX.Element {
  return (
    <div className="nk-row">
      <span className="nk-lab">{props.label}</span>
      <select disabled value={props.value}><option>{props.value}</option></select>
      <button type="button" className="nk-eq" disabled>=</button>
    </div>
  );
}

function Axis(props: { label: string; value: number }): JSX.Element {
  return (
    <span className="nk-channels">
      <span className="nk-axis">{props.label}</span>
      <input readOnly value={String(props.value)} size={5} />
    </span>
  );
}

function Check(props: { label: string; checked: boolean }): JSX.Element {
  return (
    <label className="nk-check">
      <span className={props.checked ? "nk-box on" : "nk-box"}>{props.checked ? "×" : ""}</span>
      {props.label}
    </label>
  );
}

function Swatch(props: { name: "r" | "g" | "b" | "a"; text: string }): JSX.Element {
  return (
    <span className="nk-ch-wrap">
      <span className={`nk-ch on ${props.name}`}>×</span>
      {props.text}
    </span>
  );
}

function LogTrack(props: { value: number; min: number; max: number; marks: string[] }): JSX.Element {
  const fraction = props.min <= 0
    ? Math.log1p(props.value) / Math.log1p(props.max)
    : Math.log(props.value / props.min) / Math.log(props.max / props.min);
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <span className="nk-log" aria-hidden="true">
      <span className="nk-log-line" />
      <span className="nk-log-handle" style={{ left: `${clamped * 100}%` }} />
      <span className="nk-log-marks">
        {props.marks.map((mark) => <span key={mark}>{mark}</span>)}
      </span>
    </span>
  );
}

function gray(amount: number): string {
  const byte = Math.max(0, Math.min(255, Math.round(amount * 255)));
  const hex = byte.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}
