import { api } from "../api";
import type { IndexEntry, SeedCluster } from "../types";
import { CloseIcon } from "./icons";

const PARAM_COLS: Array<{ key: keyof IndexEntry; label: string }> = [
  { key: "model", label: "Model" },
  { key: "sampler", label: "Sampler" },
  { key: "prompt", label: "Prompt" },
];

export function SeedView({
  clusters,
  onClose,
  onOpenPath,
}: {
  clusters: SeedCluster[];
  onClose: () => void;
  onOpenPath: (path: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black/95 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-snow">Seed analysis</h2>
          <p className="text-xs text-ash">
            Images sharing a seed, and how the other settings varied across them.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-charcoal/50 p-2 text-snow hover:border-ash"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-8 pr-1">
        {clusters.length === 0 && (
          <p className="py-16 text-center text-sm text-charcoal">
            No shared seeds found in this folder — every image used a distinct seed.
          </p>
        )}
        {clusters.map((cluster) => (
          <div key={cluster.seed} className="rounded-xl border border-charcoal/40 bg-carbon/40">
            <div className="flex items-center gap-3 border-b border-charcoal/30 px-4 py-3">
              <span className="rounded-md bg-snow px-2 py-0.5 font-mono text-xs font-semibold text-black">
                seed {cluster.seed}
              </span>
              <span className="text-xs text-ash">{cluster.count} images</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-ash">
                    <th className="p-3">Image</th>
                    {PARAM_COLS.map((c) => (
                      <th key={c.key} className="p-3">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cluster.items.map((item) => (
                    <tr key={item.path} className="border-t border-charcoal/20">
                      <td className="p-2">
                        <button
                          onClick={() => onOpenPath(item.path)}
                          className="flex items-center gap-2 text-left"
                        >
                          <img
                            src={api.thumbUrl(item.path)}
                            alt={item.name}
                            loading="lazy"
                            className="h-12 w-12 rounded-md object-cover"
                          />
                          <span className="max-w-[10rem] truncate text-xs text-snow">{item.name}</span>
                        </button>
                      </td>
                      {PARAM_COLS.map((c) => (
                        <td key={c.key} className="max-w-[18rem] truncate p-3 text-ash" title={String(item[c.key] ?? "")}>
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
