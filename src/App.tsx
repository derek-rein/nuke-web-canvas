import { useState } from "react";
import "./App.css";
import { NukeDag } from "./NukeDag.tsx";
import type { DagNode } from "./nuke/scene.ts";
import { SAMPLE_SCRIPT } from "./nuke/sample.ts";

export function App() {
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [selected, setSelected] = useState<DagNode | null>(null);

  return (
    <div className="app">
      <header className="toolbar">
        <button
          type="button"
          onClick={() => {
            setScript(SAMPLE_SCRIPT);
            setSelected(null);
          }}
        >
          Sample
        </button>
        <label className="file">
          Open .nk
          <input
            type="file"
            accept=".nk,.gizmo,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => {
                setScript(text);
                setSelected(null);
              });
            }}
          />
        </label>
      </header>
      <div className="workspace">
        <div className="canvas">
          <NukeDag
            script={script}
            onSelectNode={setSelected}
          />
        </div>
        <aside className="inspector">
          {selected ? (
            <>
              <h1>{selected.name}</h1>
              <p>{selected.className}</p>
              <dl>
                {Object.entries(selected.knobs).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p>Drop a .nk script</p>
          )}
        </aside>
      </div>
    </div>
  );
}
