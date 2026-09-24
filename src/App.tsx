import { useState } from "react";
import "./App.css";
import { NukeDag } from "./NukeDag.tsx";
import { SAMPLE_SCRIPT } from "./nuke/sample.ts";
import { ToolkitShelf } from "./ToolkitShelf.tsx";

export function App() {
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [title, setTitle] = useState("Sample");
  const [shelfOpen, setShelfOpen] = useState(true);
  const [autoExpand, setAutoExpand] = useState(true);

  return (
    <div className="app">
      <header className="toolbar">
        <button
          type="button"
          onClick={() => {
            setTitle("Sample");
            setScript(SAMPLE_SCRIPT);
          }}
        >
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
              void file.text().then((text) => {
                setTitle(file.name);
                setScript(text);
              });
            }}
          />
        </label>
        <span className="title">{title}</span>
      </header>
      <div className="workspace">
        <ToolkitShelf
          open={shelfOpen}
          onOpenChange={setShelfOpen}
          autoExpand={autoExpand}
          onAutoExpandChange={setAutoExpand}
          onLoad={(next, name) => {
            setTitle(name);
            setScript(next);
          }}
        />
        <div className="canvas">
          <NukeDag
            script={script}
            showProperties
            showBreadcrumbs
            autoExpand={autoExpand}
            onScriptChange={(next) => setScript(next)}
          />
        </div>
      </div>
    </div>
  );
}
