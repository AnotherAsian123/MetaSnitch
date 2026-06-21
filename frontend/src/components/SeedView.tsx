import type { SeedClusterView, SeedItemView } from "../types";
import { CloseIcon } from "./icons";
import { Spinner } from "./Spinner";

const PARAM_COLS: Array<{ key: keyof SeedItemView; label: string }> = [
  { key: "model", label: "Model" },
  { key: "sampler", label: "Sampler" },
  { key: "prompt", label: "Prompt" },
];

const PROXIMITY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "Identical", value: 0 },
  { label: "± 10", value: 10 },
  { label: "± 100", value: 100 },
  { label: "± 1,000", value: 1000 },
];

export function SeedView({
  clusters,
  loading,
  error,
  proximity,
  onProximity,
  onOpen,
  onClose,
}: {
  clusters: SeedClusterView[] | null;
  loading: boolean;
  error: string | null;
  proximity: number;
  onProximity: (n: number) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black/95 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-snow">Seed similarity</h2>
          <p className="text-xs text-ash">
            Images grouped by nearest-neighbour seed — see what identical or similar seeds look like
            across different prompts and settings.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-charcoal/50 p-2 text-snow hover:border-ash"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Proximity controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-widest text-ash">Group by</span>
        <div className="flex overflow-hidden rounded-lg border border-charcoal/50 text-xs">
          {PROXIMITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onProximity(opt.value)}
              className={`px-3 py-1.5 transition-colors ${
                proximity === opt.value ? "bg-snow text-black" : "text-ash hover:text-snow"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {loading && clusters && (
          <span className="flex items-center gap-1.5 text-xs text-ash">
            <Spinner className="h-3.5 w-3.5" /> Updating…
          </span>
        )}
        {proximity > 0 && (
          <span className="text-[11px] text-charcoal">
            Note: numerically-close seeds are grouped, but seed proximity isn't visual similarity in
            diffusion — identical seeds are the meaningful match.
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-8 pr-1">
        {error && <p className="py-16 text-center text-sm text-red-300">{error}</p>}
        {!clusters && !error && (
          <div className="flex flex-col items-center gap-3 py-16 text-ash">
            <Spinner className="h-6 w-6 text-snow" />
            <p className="text-xs">Reading seeds…</p>
          </div>
        )}
        {clusters && clusters.length === 0 && (
          <p className="py-16 text-center text-sm text-charcoal">
            No matching seeds found in this folder at this grouping.
          </p>
        )}
        {clusters?.map((cluster) => (
          <div key={cluster.seed} className="rounded-xl border border-charcoal/40 bg-carbon/40">
            <div className="flex items-center gap-3 border-b border-charcoal/30 px-4 py-3">
              <span className="rounded-md bg-snow px-2 py-0.5 font-mono text-xs font-semibold text-black">
                {proximity > 0 ? `seed ~${cluster.seed}` : `seed ${cluster.seed}`}
              </span>
              <span className="text-xs text-ash">{cluster.count} images</span>
            </div>

            {/* Thumbnail strip — the visual comparison */}
            <div className="flex gap-3 overflow-x-auto p-3">
              {cluster.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onOpen(item.id)}
                  className="group flex w-28 flex-shrink-0 flex-col gap-1.5 text-left"
                  title={item.name}
                >
                  <img
                    src={item.thumb}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="h-28 w-28 rounded-lg border border-charcoal/40 object-cover transition-all group-hover:border-ash"
                  />
                  <span className="truncate text-[11px] text-ash">{item.seed ?? ""}</span>
                </button>
              ))}
            </div>

            {/* Cross-parameter matrix — what varied */}
            <div className="overflow-x-auto border-t border-charcoal/20">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-ash">
                    <th className="p-3">Image</th>
                    <th className="p-3">Seed</th>
                    {PARAM_COLS.map((c) => (
                      <th key={c.key} className="p-3">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cluster.items.map((item) => (
                    <tr key={item.id} className="border-t border-charcoal/10">
                      <td className="max-w-[12rem] truncate p-3 text-snow">{item.name}</td>
                      <td className="p-3 font-mono text-ash">{item.seed ?? "—"}</td>
                      {PARAM_COLS.map((c) => (
                        <td
                          key={c.key}
                          className="max-w-[16rem] truncate p-3 text-ash"
                          title={String(item[c.key] ?? "")}
                        >
                          {String(item[c.key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
