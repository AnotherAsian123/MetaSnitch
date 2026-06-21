import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { BrowseModal } from "./components/BrowseModal";
import { CompareView } from "./components/CompareView";
import { Gallery } from "./components/Gallery";
import { CloseIcon, FolderIcon, UploadIcon } from "./components/icons";
import { Lightbox } from "./components/Lightbox";
import { LoadingOverlay } from "./components/Spinner";
import { SeedView } from "./components/SeedView";
import { TopBar } from "./components/TopBar";
import { mapLimit } from "./lib/async";
import { getMeta } from "./lib/metaCache";
import { clusterBySeed } from "./lib/seed";
import { useToast } from "./lib/toast";
import { useDebounce } from "./lib/useDebounce";
import type {
  GalleryItem,
  HistoryEntry,
  Metadata,
  SeedClusterView,
  SeedItemView,
  SortKey,
} from "./types";

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
  const [compareEntries, setCompareEntries] = useState<
    Array<{ label: string; md: Metadata; src: string }> | null
  >(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedProximity, setSeedProximity] = useState(0);
  const [seedClusters, setSeedClusters] = useState<SeedClusterView[] | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const seedCache = useRef<Map<string, SeedClusterView[]>>(new Map());
  const [dragOver, setDragOver] = useState(false);
  const [uploadsDir, setUploadsDir] = useState<string | null>(null);
  const [pendingOpenPath, setPendingOpenPath] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const serverMode = serverFolder != null;
  const localUrls = useRef<string[]>([]);
  const lastRecorded = useRef<string | null>(null);

  const loadHistory = useCallback(() => {
    api.history().then(setHistory).catch(() => undefined);
  }, []);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

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
          // Record the folder as analysed (once per folder) so it persists in history.
          if (!cancelled && lastRecorded.current !== serverFolder) {
            lastRecorded.current = serverFolder;
            api.addHistory(serverFolder, next.length).then(loadHistory).catch(() => undefined);
          }
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
    lastRecorded.current = null; // re-record so reopening bumps recency
    seedCache.current.clear();
    setSeedClusters(null);
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
    seedCache.current.clear();
    setSeedClusters(null);
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
        chosen.map(async (it) => ({
          label: it.name,
          md: await getMeta(keyFor(it), () => loadMeta(it)),
          src: it.kind === "server" ? api.imageUrl(it.path) : it.url,
        })),
      );
      setCompareEntries(entries);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  // Stable key for the current image source — invalidates the seed cache when
  // the folder/local set changes, but persists across opening/closing the window.
  const sourceKey =
    serverFolder ?? (localItems ? `local:${localItems.length}:${localItems[0]?.id ?? ""}` : "none");

  // Seed clusters for either mode: server uses the backend index; local parses
  // the picked files client-side (bounded concurrency) and clusters in the browser.
  const seedLoader = useCallback(
    async (proximity: number): Promise<SeedClusterView[]> => {
      if (serverFolder != null) {
        const clusters = await api.seeds(serverFolder, proximity);
        return clusters.map((c) => ({
          seed: c.seed,
          count: c.count,
          items: c.items.map((e) => ({
            id: e.path,
            name: e.name,
            seed: e.seed ?? null,
            model: e.model ?? null,
            sampler: e.sampler ?? null,
            prompt: e.prompt ?? null,
            thumb: api.thumbUrl(e.path),
          })),
        }));
      }
      if (localItems) {
        const views = await mapLimit(localItems, 6, async (it): Promise<SeedItemView> => {
          const md = await getMeta(it.id, () => loadMeta(it));
          const s = md.summary;
          return {
            id: it.id,
            name: it.name,
            seed: s.seed != null ? String(s.seed) : null,
            model: s.model != null ? String(s.model) : null,
            sampler: s.sampler != null ? String(s.sampler) : null,
            prompt: md.prompt ?? null,
            // Use the item's stable object URL — survives the gallery's thumbnail
            // LRU eviction so persisted clusters never show broken images.
            thumb: it.kind === "local" ? it.url : api.thumbUrl(it.path),
          };
        });
        return clusterBySeed(views, proximity);
      }
      return [];
    },
    [serverFolder, localItems, loadMeta],
  );

  // Cache results per source+proximity so the window persists across open/close.
  const computeSeeds = useCallback(
    async (proximity: number) => {
      const cacheKey = `${sourceKey}|${proximity}`;
      const cached = seedCache.current.get(cacheKey);
      if (cached) {
        setSeedClusters(cached);
        setSeedError(null);
        setSeedLoading(false);
        return;
      }
      setSeedLoading(true);
      setSeedError(null);
      try {
        const clusters = await seedLoader(proximity);
        seedCache.current.set(cacheKey, clusters);
        setSeedClusters(clusters);
      } catch (e) {
        setSeedError((e as Error).message);
      } finally {
        setSeedLoading(false);
      }
    },
    [sourceKey, seedLoader],
  );

  const openSeeds = () => {
    if (serverFolder == null && !localItems) return;
    setSeedOpen(true);
    computeSeeds(seedProximity);
  };

  const changeSeedProximity = (p: number) => {
    setSeedProximity(p);
    computeSeeds(p);
  };

  const openById = (id: string) => {
    const idx = items.findIndex((i) => i.id === id);
    if (idx >= 0) {
      setSeedOpen(false);
      setLightboxIndex(idx);
    }
  };

  const removeFromHistory = (p: string) => {
    api.removeHistory(p).then(setHistory).catch(() => undefined);
  };

  const doExport = (fmt: "csv" | "json") => {
    if (!serverFolder) return;
    const a = document.createElement("a");
    a.href = api.exportUrl(serverFolder, fmt);
    a.click();
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
        seedsEnabled={items.length > 0}
        onSeeds={openSeeds}
        onExport={doExport}
      />

      <main className="relative min-h-0 flex-1">
        {loading && items.length === 0 ? (
          <LoadingOverlay label={serverMode ? "Reading folder…" : "Loading images…"} />
        ) : !hasSource ? (
          <Hero
            onOpenServer={() => setBrowseOpen(true)}
            onAddImages={addUploads}
            history={history}
            onOpenRecent={openServerFolder}
            onRemoveRecent={removeFromHistory}
          />
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
        <BrowseModal
          open={browseOpen}
          onClose={() => setBrowseOpen(false)}
          onPick={openServerFolder}
          history={history}
          onRemoveRecent={removeFromHistory}
        />
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

      {seedOpen && (
        <SeedView
          clusters={seedClusters}
          loading={seedLoading}
          error={seedError}
          proximity={seedProximity}
          onProximity={changeSeedProximity}
          onOpen={openById}
          onClose={() => setSeedOpen(false)}
        />
      )}
    </div>
  );
}

function Hero({
  onOpenServer,
  onAddImages,
  history,
  onOpenRecent,
  onRemoveRecent,
}: {
  onOpenServer: () => void;
  onAddImages: (files: File[]) => void;
  history: HistoryEntry[];
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-full max-w-xl animate-fade-in">
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

        {history.length > 0 && (
          <div className="mt-10 text-left">
            <p className="mb-2 text-xs uppercase tracking-widest text-ash">Recent folders</p>
            <div className="flex flex-col divide-y divide-charcoal/30 overflow-hidden rounded-xl border border-charcoal/40 bg-carbon/40">
              {history.slice(0, 8).map((h) => (
                <div key={h.path} className="group flex items-center gap-2 px-3 py-2.5">
                  <button
                    onClick={() => onOpenRecent(h.path)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <FolderIcon className="h-4 w-4 flex-shrink-0 text-ash" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-snow">{h.name}</span>
                      <span className="block truncate text-xs text-charcoal" title={h.path}>
                        {h.path}
                      </span>
                    </span>
                  </button>
                  {h.count != null && (
                    <span className="flex-shrink-0 text-xs text-ash">{h.count} imgs</span>
                  )}
                  <button
                    onClick={() => onRemoveRecent(h.path)}
                    title="Remove from history"
                    className="flex-shrink-0 rounded p-1 text-charcoal opacity-0 transition-opacity hover:text-snow group-hover:opacity-100"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
