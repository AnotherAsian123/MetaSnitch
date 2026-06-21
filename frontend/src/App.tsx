import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { BrowseModal } from "./components/BrowseModal";
import { CompareView } from "./components/CompareView";
import { Gallery } from "./components/Gallery";
import { FolderIcon, UploadIcon } from "./components/icons";
import { Lightbox } from "./components/Lightbox";
import { LoadingOverlay } from "./components/Spinner";
import { SeedView } from "./components/SeedView";
import { TopBar } from "./components/TopBar";
import { getMeta } from "./lib/metaCache";
import { useToast } from "./lib/toast";
import { useDebounce } from "./lib/useDebounce";
import type { GalleryItem, Metadata, SeedCluster, SortKey } from "./types";

let localCounter = 0;

function comparator(sort: SortKey): (a: GalleryItem, b: GalleryItem) => number {
  switch (sort) {
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    case "size":
      return (a, b) => b.size - a.size;
    case "date-asc":
      return (a, b) => a.mtime - b.mtime;
    default:
      return (a, b) => b.mtime - a.mtime; // newest first
  }
}

export default function App() {
  const toast = useToast();
  const [serverFolder, setServerFolder] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<GalleryItem[] | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [sort, setSort] = useState<SortKey>("date");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [loading, setLoading] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [browseOpen, setBrowseOpen] = useState(false);
  const [compareEntries, setCompareEntries] = useState<Array<{ label: string; md: Metadata }> | null>(null);
  const [seedClusters, setSeedClusters] = useState<SeedCluster[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadsDir, setUploadsDir] = useState<string | null>(null);
  const [pendingOpenPath, setPendingOpenPath] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const serverMode = serverFolder != null;
  const localUrls = useRef<string[]>([]);

  const keyFor = useCallback((item: GalleryItem) => item.id, []);
  const loadMeta = useCallback(
    (item: GalleryItem): Promise<Metadata> =>
      item.kind === "server" ? api.metadata(item.path) : api.parseFile(item.file),
    [],
  );

  // Build the displayed item list whenever the source or controls change.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (serverFolder != null) {
        setLoading(true);
        try {
          const useIndex = !!debounced || sort === "model" || sort === "seed";
          let next: GalleryItem[];
          if (useIndex) {
            const res = await api.search(serverFolder, { q: debounced || undefined, sort });
            next = res.map((e) => ({
              kind: "server", id: e.path, name: e.name, path: e.path, mtime: e.mtime, size: e.size,
            }));
          } else {
            const res = await api.browse(serverFolder, sort);
            next = res.entries
              .filter((e) => e.is_image)
              .map((e) => ({
                kind: "server", id: e.path, name: e.name, path: e.path, mtime: e.mtime, size: e.size,
              }));
          }
          if (!cancelled) setItems(next);
        } catch (e) {
          if (!cancelled) toast((e as Error).message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else if (localItems) {
        let next = [...localItems];
        if (debounced) next = next.filter((i) => i.name.toLowerCase().includes(debounced.toLowerCase()));
        next.sort(comparator(sort));
        if (!cancelled) setItems(next);
      } else if (!cancelled) {
        setItems([]);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [serverFolder, localItems, sort, debounced, reload, toast]);

  // Discover the persistent uploads folder so it can be revisited across sessions.
  useEffect(() => {
    api
      .roots()
      .then((rs) => {
        const u = rs.find((r) => /[/\\]uploads$/.test(r.path));
        if (u) setUploadsDir(u.path);
      })
      .catch(() => undefined);
  }, []);

  // After uploading a single image, open it in the lightbox once it appears.
  useEffect(() => {
    if (!pendingOpenPath) return;
    const idx = items.findIndex((i) => i.kind === "server" && i.path === pendingOpenPath);
    if (idx >= 0) {
      setLightboxIndex(idx);
      setPendingOpenPath(null);
    }
  }, [items, pendingOpenPath]);

  const openServerFolder = (path: string) => {
    setLocalItems(null);
    setServerFolder(path);
    setSelected(new Set());
    setSearch("");
    setLightboxIndex(null);
  };

  const setLocalFiles = (files: File[], openFirst = false) => {
    localUrls.current.forEach((u) => URL.revokeObjectURL(u));
    localUrls.current = [];
    const built: GalleryItem[] = files.map((file) => {
      const url = URL.createObjectURL(file);
      localUrls.current.push(url);
      return {
        kind: "local",
        id: `local-${++localCounter}`,
        name: file.name,
        file,
        url,
        mtime: file.lastModified / 1000,
        size: file.size,
      };
    });
    setServerFolder(null);
    setSelected(new Set());
    setSearch("");
    setLocalItems(built);
    setLightboxIndex(openFirst && built.length ? 0 : null);
  };

  useEffect(() => () => localUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Persist uploaded/dropped images server-side (/config/uploads) so they get
  // real thumbnails and survive across sessions, then show that folder. Adding
  // more later just uploads more into the same folder.
  const addUploads = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|jfif)$/i.test(f.name));
    if (!imgs.length) return;
    setLoading(true);
    try {
      const results = await Promise.all(imgs.map((f) => api.uploadFile(f)));
      const dir = results[0].path.replace(/[/\\][^/\\]*$/, "");
      setUploadsDir(dir);
      if (imgs.length === 1) setPendingOpenPath(results[0].path);
      if (serverFolder === dir) setReload((r) => r + 1);
      else openServerFolder(dir);
      toast(`Added ${results.length} image${results.length === 1 ? "" : "s"} to your library`, "success");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Global drag-and-drop of one or more images from anywhere → persisted upload.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) void addUploads(files);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openCompare = async () => {
    const chosen = items.filter((i) => selected.has(i.id));
    if (chosen.length < 2) return;
    try {
      const entries = await Promise.all(
        chosen.map(async (it) => ({ label: it.name, md: await getMeta(keyFor(it), () => loadMeta(it)) })),
      );
      setCompareEntries(entries);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const openSeeds = async () => {
    if (!serverFolder) return;
    setLoading(true);
    try {
      setSeedClusters(await api.seeds(serverFolder));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const doExport = (fmt: "csv" | "json") => {
    if (!serverFolder) return;
    const a = document.createElement("a");
    a.href = api.exportUrl(serverFolder, fmt);
    a.click();
  };

  const openPath = (path: string) => {
    const idx = items.findIndex((i) => i.kind === "server" && i.path === path);
    if (idx >= 0) {
      setSeedClusters(null);
      setLightboxIndex(idx);
    }
  };

  const hasSource = serverMode || !!localItems;

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <TopBar
        folderLabel={serverFolder ?? (localItems ? `Local folder · ${localItems.length} images` : null)}
        serverMode={serverMode}
        sort={sort}
        setSort={setSort}
        search={search}
        setSearch={setSearch}
        selectedCount={selected.size}
        onOpenServer={() => setBrowseOpen(true)}
        onLocalFiles={(files) => setLocalFiles(files)}
        onAddImages={addUploads}
        onOpenUploads={uploadsDir ? () => openServerFolder(uploadsDir) : undefined}
        onCompare={openCompare}
        onClearSelection={() => setSelected(new Set())}
        onSeeds={openSeeds}
        onExport={doExport}
      />

      <main className="relative min-h-0 flex-1">
        {loading && items.length === 0 ? (
          <LoadingOverlay label={serverMode ? "Reading folder…" : "Loading images…"} />
        ) : !hasSource ? (
          <Hero onOpenServer={() => setBrowseOpen(true)} onAddImages={addUploads} />
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-ash">
            <p>No images found here.</p>
          </div>
        ) : (
          <Gallery items={items} selected={selected} onOpen={setLightboxIndex} onToggleSelect={toggleSelect} />
        )}

        {loading && items.length > 0 && (
          <div className="absolute right-4 top-4 rounded-full bg-carbon/90 px-3 py-1.5 text-xs text-ash">
            Updating…
          </div>
        )}
      </main>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="animate-scale-in rounded-3xl border-2 border-dashed border-snow/60 px-16 py-12 text-center">
            <UploadIcon className="mx-auto h-10 w-10 text-snow" />
            <p className="mt-3 text-lg font-medium text-snow">Drop images to inspect</p>
          </div>
        </div>
      )}

      {browseOpen && (
        <BrowseModal open={browseOpen} onClose={() => setBrowseOpen(false)} onPick={openServerFolder} />
      )}

      {lightboxIndex !== null && items[lightboxIndex] && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          setIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          keyFor={keyFor}
          loadMeta={loadMeta}
          onAddToCompare={(it) => {
            toggleSelect(it.id);
            toast("Added to selection — pick another and hit Compare", "info");
          }}
        />
      )}

      {compareEntries && (
        <CompareView entries={compareEntries} onClose={() => setCompareEntries(null)} />
      )}

      {seedClusters && (
        <SeedView clusters={seedClusters} onClose={() => setSeedClusters(null)} onOpenPath={openPath} />
      )}
    </div>
  );
}

function Hero({
  onOpenServer,
  onAddImages,
}: {
  onOpenServer: () => void;
  onAddImages: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight text-snow md:text-4xl">
          See how any AI image was made
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ash">
          Drag images anywhere on this page, open a folder on your server, or choose images from
          this device. Dropped images are saved to your library and persist between sessions.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onOpenServer}
            className="inline-flex items-center gap-2 rounded-xl bg-snow px-5 py-2.5 font-medium text-black transition-opacity hover:opacity-90"
          >
            <FolderIcon className="h-5 w-5" /> Open server folder
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-charcoal/60 px-5 py-2.5 font-medium text-snow transition-colors hover:border-ash"
          >
            <UploadIcon className="h-5 w-5" /> Choose images
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onAddImages(files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
