import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../lib/toast";
import type { DirEntry } from "../types";
import { CloseIcon, FolderIcon } from "./icons";
import { Spinner } from "./Spinner";

export function BrowseModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const toast = useToast();
  const [path, setPath] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = (target: string) => {
    setLoading(true);
    api
      .browse(target, "name")
      .then((res) => {
        setPath(res.path);
        setParent(res.parent);
        setEntries(res.entries);
      })
      .catch((e) => toast((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const dirs = entries.filter((e) => e.is_dir);
  const imageCount = entries.filter((e) => e.is_image).length;

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl animate-scale-in flex-col rounded-2xl border border-charcoal/50 bg-carbon shadow-2xl">
        <div className="flex items-center justify-between border-b border-charcoal/40 p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-snow">Open a server folder</h2>
            <p className="truncate text-xs text-ash">{path || "Choose a mounted location"}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-ash hover:text-snow">
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-6 w-6 text-snow" />
            </div>
          ) : (
            <div className="flex flex-col">
              {parent !== null && (
                <button
                  onClick={() => load(parent)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ash transition-colors hover:bg-black/30"
                >
                  <FolderIcon className="h-4 w-4" /> ..
                </button>
              )}
              {dirs.map((d) => (
                <button
                  key={d.path}
                  onClick={() => load(d.path)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-snow transition-colors hover:bg-black/30"
                >
                  <FolderIcon className="h-4 w-4 text-ash" />
                  <span className="truncate">{d.name}</span>
                </button>
              ))}
              {!dirs.length && parent === null && (
                <p className="px-3 py-6 text-center text-sm text-charcoal">
                  No mounted folders found. Mount your image shares into the container.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-charcoal/40 p-4">
          <span className="text-xs text-ash">
            {path ? `${imageCount} image${imageCount === 1 ? "" : "s"} here` : ""}
          </span>
          <button
            disabled={!path}
            onClick={() => {
              onPick(path);
              onClose();
            }}
            className="rounded-lg bg-snow px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Open this folder
          </button>
        </div>
      </div>
    </div>
  );
}
