import { useState } from "react";
import "./App.css";
import { NukeDag } from "./NukeDag.tsx";
import { SAMPLE_SCRIPT } from "./nuke/sample.ts";

export function App() {
  const [script, setScript] = useState(SAMPLE_SCRIPT);

  return (
    <div className="app">
      <header className="toolbar">
        <button type="button" onClick={() => setScript(SAMPLE_SCRIPT)}>
          Sample
        </button>
        <label className="file">
          Open .nk / .gizmo
          <input
            type="file"
            accept=".nk,.gizmo,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => setScript(text));
            }}
          />
        </label>
      </header>
      <div className="workspace">
        <div className="canvas">
          <NukeDag
            script={script}
            showProperties
            onScriptChange={(next) => setScript(next)}
          />
        </div>
      </div>
    </div>
  );
}
