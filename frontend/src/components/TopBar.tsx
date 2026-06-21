import { useRef } from "react";
import type { SortKey } from "../types";
import { CompareIcon, FolderIcon, SearchIcon, SeedIcon, UploadIcon } from "./icons";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif", ".avif", ".jfif"];
const isImageName = (n: string) => IMAGE_EXTS.some((e) => n.toLowerCase().endsWith(e));

export function TopBar({
  folderLabel,
  serverMode,
  sort,
  setSort,
  search,
  setSearch,
  selectedCount,
  onOpenServer,
  onLocalFiles,
  onCompare,
  onClearSelection,
  onSeeds,
  onExport,
}: {
  folderLabel: string | null;
  serverMode: boolean;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  search: string;
  setSearch: (s: string) => void;
  selectedCount: number;
  onOpenServer: () => void;
  onLocalFiles: (files: File[]) => void;
  onCompare: () => void;
  onClearSelection: () => void;
  onSeeds: () => void;
  onExport: (fmt: "csv" | "json") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pickLocal = async () => {
    const anyWin = window as unknown as { showDirectoryPicker?: () => Promise<any> };
    if (anyWin.showDirectoryPicker) {
      try {
        const handle = await anyWin.showDirectoryPicker();
        const files: File[] = [];
        for await (const entry of handle.values()) {
          if (entry.kind === "file" && isImageName(entry.name)) {
            files.push(await entry.getFile());
          }
        }
        onLocalFiles(files);
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        // fall through to the cross-browser input fallback (Firefox/Safari)
      }
    }
    inputRef.current?.click();
  };

  return (
    <header className="z-20 flex flex-wrap items-center gap-2 border-b border-charcoal/40 bg-black/80 px-4 py-3 backdrop-blur">
      <div className="mr-2 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-snow text-sm font-black text-black">
          M
        </div>
        <span className="text-sm font-semibold tracking-wide text-snow">MetaSnitch</span>
      </div>

      <button
        onClick={onOpenServer}
        className="inline-flex items-center gap-2 rounded-lg border border-charcoal/50 px-3 py-1.5 text-sm text-snow transition-colors hover:border-ash"
      >
        <FolderIcon className="h-4 w-4" /> Open folder
      </button>
      <button
        onClick={pickLocal}
        className="inline-flex items-center gap-2 rounded-lg border border-charcoal/50 px-3 py-1.5 text-sm text-ash transition-colors hover:border-ash hover:text-snow"
      >
        <UploadIcon className="h-4 w-4" /> Local folder
      </button>
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error non-standard but widely supported folder picker
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) => isImageName(f.name));
          if (files.length) onLocalFiles(files);
          e.target.value = "";
        }}
      />

      {folderLabel && (
        <span className="ml-1 hidden max-w-[20rem] truncate text-xs text-ash md:inline" title={folderLabel}>
          {folderLabel}
        </span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={serverMode ? "Search model, sampler, seed, prompt…" : "Filter by name…"}
            className="w-48 rounded-lg border border-charcoal/50 bg-carbon/60 py-1.5 pl-8 pr-3 text-sm text-snow placeholder:text-charcoal focus:border-ash focus:outline-none md:w-64"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-charcoal/50 bg-carbon/60 py-1.5 pl-2 pr-6 text-sm text-snow focus:border-ash focus:outline-none"
        >
          <option value="date">Newest</option>
          <option value="date-asc">Oldest</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
          {serverMode && <option value="model">Model</option>}
          {serverMode && <option value="seed">Seed</option>}
        </select>

        {serverMode && (
          <>
            <button
              onClick={onSeeds}
              title="Seed analysis"
              className="inline-flex items-center gap-1.5 rounded-lg border border-charcoal/50 px-2.5 py-1.5 text-sm text-ash transition-colors hover:border-ash hover:text-snow"
            >
              <SeedIcon className="h-4 w-4" />
            </button>
            <div className="flex overflow-hidden rounded-lg border border-charcoal/50">
              <button
                onClick={() => onExport("csv")}
                className="px-2.5 py-1.5 text-xs text-ash transition-colors hover:bg-black/30 hover:text-snow"
              >
                CSV
              </button>
              <button
                onClick={() => onExport("json")}
                className="border-l border-charcoal/50 px-2.5 py-1.5 text-xs text-ash transition-colors hover:bg-black/30 hover:text-snow"
              >
                JSON
              </button>
            </div>
          </>
        )}

        {selectedCount > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onCompare}
              disabled={selectedCount < 2}
              className="inline-flex items-center gap-1.5 rounded-lg bg-snow px-3 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <CompareIcon className="h-4 w-4" /> Compare ({selectedCount})
            </button>
            <button onClick={onClearSelection} className="text-xs text-ash hover:text-snow">
              clear
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
