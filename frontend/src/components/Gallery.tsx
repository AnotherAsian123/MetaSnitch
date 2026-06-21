import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { GalleryItem } from "../types";

const TARGET_CELL = 184; // px
const GAP = 12;

function thumbSrc(item: GalleryItem): string {
  return item.kind === "server" ? api.thumbUrl(item.path) : item.url;
}

function Cell({
  item,
  selected,
  onOpen,
  onToggleSelect,
}: {
  item: GalleryItem;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? onToggleSelect(e) : onOpen())}
      className={`group relative aspect-square overflow-hidden rounded-xl border transition-all duration-200 ${
        selected ? "border-snow ring-2 ring-snow/60" : "border-charcoal/30 hover:border-ash"
      }`}
      title={item.name}
    >
      {!loaded && <div className="skeleton absolute inset-0" />}
      <img
        src={thumbSrc(item)}
        alt={item.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.04] ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
        <p className="truncate text-left text-xs text-snow">{item.name}</p>
      </div>
      {selected && <div className="absolute right-2 top-2 h-3 w-3 rounded-full bg-snow" />}
    </button>
  );
}

export function Gallery({
  items,
  selected,
  onOpen,
  onToggleSelect,
}: {
  items: GalleryItem[];
  selected: Set<string>;
  onOpen: (index: number) => void;
  onToggleSelect: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const compute = () => {
      const width = el.clientWidth;
      setColumns(Math.max(2, Math.floor((width + GAP) / (TARGET_CELL + GAP))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(items.length / columns);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TARGET_CELL + GAP,
    overscan: 3,
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto px-4 pb-8 pt-2">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * columns;
          const rowItems = items.slice(start, start + columns);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: GAP,
                paddingBottom: GAP,
              }}
            >
              {rowItems.map((item, i) => (
                <Cell
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  onOpen={() => onOpen(start + i)}
                  onToggleSelect={() => onToggleSelect(item.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
