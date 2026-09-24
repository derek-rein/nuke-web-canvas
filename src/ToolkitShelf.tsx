import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { loadNstCatalog, loadNstFile, type NstCatalog, type NstFile } from "./stories/nst/toolkit.ts";

export function ToolkitShelf(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoExpand: boolean;
  onAutoExpandChange: (value: boolean) => void;
  onLoad: (script: string, title: string) => void;
}): JSX.Element {
  const [catalog, setCatalog] = useState<NstCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<"all" | "gizmos" | "nk_files">("all");
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadNstCatalog().then(
      (next) => {
        if (live) setCatalog(next);
      },
      (reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : "Could not load the toolkit index");
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog?.files ?? []).filter((file) => {
      if (folder !== "all" && file.folder !== folder) return false;
      return needle.length === 0 || file.name.toLowerCase().includes(needle);
    });
  }, [catalog, folder, query]);

  async function openFile(file: NstFile) {
    setLoading(file.path);
    setError(null);
    try {
      props.onLoad(await loadNstFile(file.path), file.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load that script");
    } finally {
      setLoading(null);
    }
  }

  return (
    <aside className={props.open ? "shelf" : "shelf closed"}>
      <div className="shelf-head">
        <button type="button" onClick={() => props.onOpenChange(!props.open)}>
          {props.open ? "Hide toolkit" : "Survival Toolkit"}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={props.autoExpand}
            onChange={(event) => props.onAutoExpandChange(event.target.checked)}
          />
          Auto expand
        </label>
      </div>
      {props.open ? (
        <>
          <p className="shelf-note">
            {catalog ? `${catalog.files.length} scripts` : "Loading index…"} from one pinned commit. The files stay on GitHub.
          </p>
          <input
            className="shelf-search"
            value={query}
            placeholder="Search tools"
            aria-label="Search the toolkit"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="shelf-filters">
            <Filter label="All" on={folder === "all"} pick={() => setFolder("all")} />
            <Filter label="Gizmos" on={folder === "gizmos"} pick={() => setFolder("gizmos")} />
            <Filter label="Scripts" on={folder === "nk_files"} pick={() => setFolder("nk_files")} />
          </div>
          {error ? <p className="shelf-note">{error}</p> : null}
          <ul className="shelf-list">
            {files.map((file) => (
              <li key={file.path}>
                <button type="button" disabled={loading === file.path} onClick={() => void openFile(file)}>
                  {loading === file.path ? "Loading…" : file.name}
                </button>
                <span>{file.kind}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}

function Filter(props: { label: string; on: boolean; pick: () => void }): JSX.Element {
  return (
    <button type="button" className={props.on ? "on" : ""} onClick={props.pick}>
      {props.label}
    </button>
  );
}
