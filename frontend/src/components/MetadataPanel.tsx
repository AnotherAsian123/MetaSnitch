import { useState } from "react";
import { api } from "../api";
import { copyText, toA1111String } from "../lib/format";
import { useToast } from "../lib/toast";
import type { CustomNodeDetail, GalleryItem, Metadata } from "../types";
import { CopyIcon, DownloadIcon, StarIcon } from "./icons";

const SUMMARY_ORDER = ["model", "seed", "sampler", "scheduler", "steps", "cfg", "denoise", "size"];
const SUMMARY_LABELS: Record<string, string> = {
  model: "Model",
  seed: "Seed",
  sampler: "Sampler",
  scheduler: "Scheduler",
  steps: "Steps",
  cfg: "CFG",
  denoise: "Denoise",
  size: "Size",
};

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function CopyChip({ text, label }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      onClick={async () => {
        await copyText(text);
        toast("Copied to clipboard", "success");
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-charcoal/50 px-2 py-1 text-xs text-ash transition-colors hover:border-ash hover:text-snow"
    >
      <CopyIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
  accent,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  accent?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-charcoal/30">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span
          className={`text-xs font-semibold uppercase tracking-widest ${accent ? "text-snow" : "text-ash"}`}
        >
          {title}
        </span>
        <span className={`text-ash transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <div className="animate-fade-in pb-4">{children}</div>}
    </div>
  );
}

function KeyValueTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!entries.length) return <p className="text-sm text-charcoal">Nothing here.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-charcoal/30">
      {entries.map(([k, v], i) => {
        const str = valueToString(v);
        const nested = typeof v === "object";
        return (
          <div
            key={k}
            className={`grid grid-cols-[7rem_1fr] gap-2 px-3 py-2 text-sm ${i % 2 ? "bg-black/20" : ""}`}
          >
            <span className="truncate text-ash" title={k}>
              {k}
            </span>
            {nested ? (
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-snow">
                {str}
              </pre>
            ) : (
              <span
                className="cursor-copy break-words text-snow"
                title="Click to copy"
                onClick={() => copyText(str)}
              >
                {str}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CustomNodeRow({ node }: { node: CustomNodeDetail }) {
  const [open, setOpen] = useState(false);
  const settingsCount = Object.keys(node.settings ?? {}).length;
  return (
    <div className="overflow-hidden rounded-lg border border-charcoal/40 bg-black/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="truncate font-mono text-xs text-snow" title={node.type}>
          {node.type}
          <span className="ml-1.5 text-charcoal">#{node.id}</span>
        </span>
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-ash">
          {settingsCount > 0 ? `${settingsCount} setting${settingsCount === 1 ? "" : "s"}` : "no settings"}
          {settingsCount > 0 && (
            <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          )}
        </span>
      </button>
      {open && settingsCount > 0 && (
        <div className="animate-fade-in px-2 pb-2">
          <KeyValueTable data={node.settings} />
        </div>
      )}
    </div>
  );
}

export function MetadataPanel({
  md,
  item,
  onAddToCompare,
}: {
  md: Metadata;
  item: GalleryItem | null;
  onAddToCompare?: (item: GalleryItem) => void;
}) {
  const toast = useToast();
  const [favorite, setFavorite] = useState<boolean | null>(null);

  const summaryEntries = SUMMARY_ORDER.filter(
    (k) => md.summary[k] !== undefined && md.summary[k] !== null && md.summary[k] !== "",
  );

  const downloadOriginal = () => {
    if (!item) return;
    const a = document.createElement("a");
    a.href = item.kind === "server" ? api.imageUrl(item.path) : item.url;
    a.download = item.name;
    a.click();
  };

  const toggleFavorite = async () => {
    if (!item || item.kind !== "server") {
      toast("Favorites are available for server folders", "info");
      return;
    }
    try {
      const next = !(favorite ?? false);
      await api.setTags(item.path, { favorite: next });
      setFavorite(next);
      toast(next ? "Added to favorites" : "Removed from favorites", "success");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header: source + actions */}
      <div className="flex items-center justify-between gap-2 border-b border-charcoal/40 pb-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ash">Detected</p>
          <p className="text-lg font-semibold text-snow">{md.source}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleFavorite}
            title="Favorite"
            className="rounded-md border border-charcoal/50 p-2 text-ash transition-colors hover:border-ash hover:text-snow"
          >
            <StarIcon className="h-4 w-4" filled={!!favorite} />
          </button>
          <button
            onClick={downloadOriginal}
            title="Download original (metadata intact)"
            className="rounded-md border border-charcoal/50 p-2 text-ash transition-colors hover:border-ash hover:text-snow"
          >
            <DownloadIcon className="h-4 w-4" />
          </button>
          {item && onAddToCompare && (
            <button
              onClick={() => onAddToCompare(item)}
              className="rounded-md border border-charcoal/50 px-2.5 py-2 text-xs text-ash transition-colors hover:border-ash hover:text-snow"
            >
              Compare
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* Summary — pinned, highest contrast (plan: important-first) */}
        {summaryEntries.length > 0 && (
          <div className="py-4">
            <div className="grid grid-cols-2 gap-2">
              {summaryEntries.map((k) => (
                <div
                  key={k}
                  className="cursor-copy rounded-lg border border-charcoal/40 bg-carbon/60 px-3 py-2 transition-colors hover:border-ash"
                  onClick={() => copyText(valueToString(md.summary[k]))}
                  title="Click to copy"
                >
                  <p className="text-[10px] uppercase tracking-widest text-ash">
                    {SUMMARY_LABELS[k] ?? k}
                  </p>
                  <p className="truncate text-sm font-medium text-snow" title={valueToString(md.summary[k])}>
                    {valueToString(md.summary[k])}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prompts */}
        {(md.prompt || md.negative_prompt) && (
          <Section title="Prompt" defaultOpen accent>
            {md.prompt && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-ash">Positive</span>
                  <CopyChip text={md.prompt} />
                </div>
                <p className="whitespace-pre-wrap break-words rounded-lg border border-charcoal/30 bg-black/30 p-3 text-sm text-snow">
                  {md.prompt}
                </p>
              </div>
            )}
            {md.negative_prompt && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-ash">Negative</span>
                  <CopyChip text={md.negative_prompt} />
                </div>
                <p className="whitespace-pre-wrap break-words rounded-lg border border-charcoal/30 bg-black/30 p-3 text-sm text-ash">
                  {md.negative_prompt}
                </p>
              </div>
            )}
            <div className="mt-3">
              <CopyChip text={toA1111String(md)} label="Copy as A1111 string" />
            </div>
          </Section>
        )}

        {/* LoRAs */}
        {md.loras.length > 0 && (
          <Section title={`LoRAs (${md.loras.length})`}>
            <KeyValueTable
              data={Object.fromEntries(md.loras.map((l, i) => [`${i + 1}. ${l.name ?? "?"}`, l]))}
            />
          </Section>
        )}

        {/* Nested groups */}
        {Object.entries(md.groups).map(([title, data]) => (
          <Section key={title} title={title}>
            <KeyValueTable data={data} />
          </Section>
        ))}

        {/* ComfyUI transparency — each custom node expands to show its settings */}
        {(md.custom_node_details?.length ?? 0) > 0 ? (
          <Section title={`Custom nodes (${md.custom_node_details.length})`}>
            <div className="flex flex-col gap-1.5">
              {md.custom_node_details.map((node) => (
                <CustomNodeRow key={`${node.type}#${node.id}`} node={node} />
              ))}
            </div>
          </Section>
        ) : (
          md.custom_nodes.length > 0 && (
            <Section title={`Custom nodes (${md.custom_nodes.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {md.custom_nodes.map((n) => (
                  <span
                    key={n}
                    className="rounded-md border border-charcoal/40 bg-black/30 px-2 py-1 font-mono text-xs text-ash"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </Section>
          )
        )}

        {md.unresolved_nodes.length > 0 && (
          <Section title={`Unresolved (${md.unresolved_nodes.length})`}>
            <p className="mb-2 text-xs text-charcoal">
              Nodes we couldn't fully interpret — full graph is below in Raw.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {md.unresolved_nodes.slice(0, 60).map((n) => (
                <span key={n} className="rounded-md bg-black/30 px-2 py-1 font-mono text-xs text-charcoal">
                  {n}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Raw — always kept, searchable/copyable */}
        {Object.keys(md.raw).length > 0 && (
          <Section title="Raw metadata">
            <div className="mb-2 flex justify-end">
              <CopyChip text={JSON.stringify(md.raw, null, 2)} label="Copy raw" />
            </div>
            <pre className="max-h-96 overflow-auto rounded-lg border border-charcoal/30 bg-black/40 p-3 font-mono text-xs text-ash">
              {JSON.stringify(md.raw, null, 2)}
            </pre>
          </Section>
        )}
      </div>
    </div>
  );
}
