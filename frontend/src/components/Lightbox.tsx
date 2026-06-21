import { useCallbackRef } from "../lib/useCallbackRef";
import { useEffect, useState } from "react";
import { api } from "../api";
import { getMeta, peekMeta, prefetchMeta } from "../lib/metaCache";
import type { GalleryItem, Metadata } from "../types";
import { ChevronLeft, ChevronRight, CloseIcon } from "./icons";
import { MetadataPanel } from "./MetadataPanel";
import { Spinner } from "./Spinner";

function imageSrc(item: GalleryItem): string {
  return item.kind === "server" ? api.imageUrl(item.path) : item.url;
}

export function Lightbox({
  items,
  index,
  setIndex,
  onClose,
  keyFor,
  loadMeta,
  onAddToCompare,
}: {
  items: GalleryItem[];
  index: number;
  setIndex: (i: number) => void;
  onClose: () => void;
  keyFor: (item: GalleryItem) => string;
  loadMeta: (item: GalleryItem) => Promise<Metadata>;
  onAddToCompare?: (item: GalleryItem) => void;
}) {
  const item = items[index];
  const [md, setMd] = useState<Metadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = useCallbackRef((delta: number) => {
    setIndex((index + delta + items.length) % items.length);
  });

  useEffect(() => {
    if (!item) return;
    const key = keyFor(item);
    const cached = peekMeta(key);
    setError(null);
    if (cached) {
      setMd(cached);
    } else {
      setMd(null);
      getMeta(key, () => loadMeta(item))
        .then((m) => setMd((prev) => (items[index] === item ? m : prev)))
        .catch((e) => setError((e as Error).message));
    }
    // Prefetch ±2 neighbors so navigation is instant (plan §7).
    for (const d of [1, -1, 2, -2]) {
      const n = items[(index + d + items.length) % items.length];
      if (n && n !== item) prefetchMeta(keyFor(n), () => loadMeta(n));
    }
  }, [item, index, items, keyFor, loadMeta]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black/90 backdrop-blur-sm md:flex-row">
      {/* Image stage — clicking the empty space around the image closes it */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-charcoal/50 bg-black/40 p-2 text-snow transition-colors hover:border-ash"
        >
          <CloseIcon />
        </button>
        <button
          onClick={() => go(-1)}
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-charcoal/50 bg-black/40 p-2 text-snow transition-all hover:border-ash hover:bg-black/60"
        >
          <ChevronLeft />
        </button>
        <button
          onClick={() => go(1)}
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-charcoal/50 bg-black/40 p-2 text-snow transition-all hover:border-ash hover:bg-black/60"
        >
          <ChevronRight />
        </button>
        <img
          key={item.id}
          src={imageSrc(item)}
          alt={item.name}
          className="max-h-full max-w-full animate-scale-in rounded-lg object-contain shadow-2xl"
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-ash">
          {index + 1} / {items.length} · {item.name}
        </div>
      </div>

      {/* Metadata sidebar (bottom sheet on mobile) */}
      <aside className="flex h-[45vh] w-full flex-col border-t border-charcoal/40 bg-carbon/95 p-4 md:h-auto md:w-[420px] md:border-l md:border-t-0">
        {md ? (
          <MetadataPanel md={md} item={item} onAddToCompare={onAddToCompare} />
        ) : error ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-red-300">
            {error}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-ash">
            <Spinner className="h-6 w-6" />
          </div>
        )}
      </aside>
    </div>
  );
}
