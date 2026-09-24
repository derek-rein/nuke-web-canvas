import type { JSX } from "react";
import {
  channelDot,
  SHUFFLE_SOURCES,
  type ShuffleModel,
  type ShuffleRow,
  type ShuffleSource,
} from "./nuke/shuffle.ts";

export function ShuffleBoard(props: { model: ShuffleModel }): JSX.Element {
  return props.model.kind === "classic" ? <Classic model={props.model} /> : <Links model={props.model} />;
}

function Classic(props: { model: Extract<ShuffleModel, { kind: "classic" }> }): JSX.Element {
  const model = props.model;
  const in2 = model.in2 !== "none";
  const out2 = model.out2 !== "none";
  return (
    <div className="nk-shuffle">
      <div className="nk-shuffle-head">
        <Layer label="in 1" value={model.in1} />
        <Layer label="in 2" value={model.in2} />
        <Layer label="" value={model.out1} />
      </div>
      <Matrix rows={model.rows} in2={in2} enabled />
      <div className="nk-shuffle-head">
        <Layer label="" value={model.out2} />
      </div>
      <Matrix rows={model.extra} in2={in2} enabled={out2} />
    </div>
  );
}

function Matrix(props: { rows: ShuffleRow[]; in2: boolean; enabled: boolean }): JSX.Element {
  return (
    <div className={props.enabled ? "nk-shuffle-grid" : "nk-shuffle-grid off"}>
      <div className="nk-shuffle-row">
        <span className="nk-shuffle-name" />
        {SHUFFLE_SOURCES.map((source, index) => (
          <span key={source.id} className="nk-shuffle-slot">
            {index === 4 || index === 6 ? <span className="nk-shuffle-join">→</span> : null}
            <span className="nk-shuffle-col">{source.header}</span>
          </span>
        ))}
      </div>
      {props.rows.map((row) => (
        <div className="nk-shuffle-row" key={row.knob}>
          <span className="nk-shuffle-name" />
          {SHUFFLE_SOURCES.map((source, index) => (
            <span key={source.id} className="nk-shuffle-slot">
              {index === 4 || index === 6 ? <span className="nk-shuffle-join">→</span> : null}
              <Cell source={source} selected={props.enabled && row.source === source.id} in2={props.in2} enabled={props.enabled} />
            </span>
          ))}
          <span className="nk-shuffle-join">→</span>
          <span className="nk-shuffle-out">{props.enabled ? row.label : ""}</span>
        </div>
      ))}
    </div>
  );
}

function Cell(props: { source: ShuffleSource; selected: boolean; in2: boolean; enabled: boolean }): JSX.Element {
  const dormant = !props.enabled || (props.source.group === "in2" && !props.in2);
  const background = dormant && props.source.group !== "const" ? "#6e6e6e" : props.source.color;
  return (
    <button type="button" className={props.selected ? "nk-sh-cell on" : "nk-sh-cell"} disabled style={{ background }}>
      {props.selected ? "×" : ""}
    </button>
  );
}

function Layer(props: { label: string; value: string }): JSX.Element {
  return (
    <span className="nk-channels">
      {props.label ? <span className="nk-lab nk-shuffle-lab">{props.label}</span> : null}
      <select value={props.value} disabled>
        <option value={props.value}>{props.value}</option>
      </select>
      <button type="button" className="nk-eq" disabled aria-label="Set channels">=</button>
    </span>
  );
}

function Links(props: { model: Extract<ShuffleModel, { kind: "links" }> }): JSX.Element {
  const model = props.model;
  return (
    <div className="nk-noodle">
      <Pair title="Input Layer" input={model.inInput} layer={model.inLayer} output={model.outLayer} links={model.links} live />
      <Pair title="" input={model.in2Input} layer={model.in2Layer} output={model.out2Layer} links={[]} live={model.in2Layer !== "none" && model.out2Layer !== "none"} />
    </div>
  );
}

function Pair(props: {
  title: string;
  input: string;
  layer: string;
  output: string;
  links: { src: string; dst: string }[];
  live: boolean;
}): JSX.Element {
  const rows = props.links.length > 0 ? props.links : props.live ? [] : [];
  return (
    <div className="nk-noodle-pair">
      <div className="nk-noodle-col">
        {props.title ? <div className="nk-noodle-title">{props.title}</div> : <div className="nk-noodle-title quiet" />}
        <div className="nk-noodle-box">
          <span className="nk-channels">
            <span>In</span>
            <select value={props.input} disabled><option>{props.input}</option></select>
            <select value={props.layer} disabled><option>{props.layer}</option></select>
            <button type="button" className="nk-eq" disabled aria-label="Set channels">=</button>
          </span>
          {rows.map((link) => (
            <div className="nk-noodle-line" key={link.src}>
              <span>{link.src}</span>
              <span className="nk-dot" style={{ background: channelDot(link.src) }} />
            </div>
          ))}
        </div>
      </div>
      <div className="nk-noodle-col">
        {props.title ? <div className="nk-noodle-title out">Output Layer</div> : <div className="nk-noodle-title quiet" />}
        <div className="nk-noodle-box">
          <span className="nk-channels">
            <select value={props.output} disabled><option>{props.output}</option></select>
            <button type="button" className="nk-eq" disabled aria-label="Set channels">=</button>
          </span>
          {rows.map((link) => (
            <div className="nk-noodle-line" key={link.dst}>
              <span className="nk-link" style={{ borderColor: channelDot(link.src) }} />
              <span className="nk-dot" style={{ background: channelDot(link.dst) }} />
              <span className="nk-box on">×</span>
              <button type="button" className="nk-font-style" disabled>D</button>
              <span>{link.dst}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
