import { copyText } from "../lib/format";
import type { Metadata } from "../types";
import { CloseIcon } from "./icons";

const ROWS: Array<{ key: string; label: string }> = [
  { key: "source", label: "Source" },
  { key: "model", label: "Model" },
  { key: "seed", label: "Seed" },
  { key: "sampler", label: "Sampler" },
  { key: "scheduler", label: "Scheduler" },
  { key: "steps", label: "Steps" },
  { key: "cfg", label: "CFG" },
  { key: "denoise", label: "Denoise" },
  { key: "size", label: "Size" },
  { key: "prompt", label: "Prompt" },
  { key: "negative_prompt", label: "Negative" },
];

function valueFor(md: Metadata, key: string): string {
  if (key === "source") return md.source;
  if (key === "prompt") return md.prompt ?? "";
  if (key === "negative_prompt") return md.negative_prompt ?? "";
  const v = md.summary[key];
  return v === undefined || v === null ? "" : String(v);
}

export function CompareView({
  entries,
  onClose,
}: {
  entries: Array<{ label: string; md: Metadata }>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black/95 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-snow">
          Compare <span className="text-ash">({entries.length})</span>
        </h2>
        <button
          onClick={onClose}
          className="rounded-full border border-charcoal/50 p-2 text-snow hover:border-ash"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-charcoal/40">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-carbon">
            <tr>
              <th className="w-32 border-b border-charcoal/40 p-3 text-left text-xs uppercase tracking-widest text-ash">
                Field
              </th>
              {entries.map((e, i) => (
                <th
                  key={i}
                  className="min-w-[14rem] border-b border-l border-charcoal/40 p-3 text-left text-xs text-snow"
                >
                  <span className="line-clamp-2">{e.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const values = entries.map((e) => valueFor(e.md, row.key));
              const allEqual = values.every((v) => v === values[0]);
              if (values.every((v) => v === "")) return null;
              return (
                <tr key={row.key} className={allEqual ? "" : "bg-snow/[0.04]"}>
                  <td className="border-b border-charcoal/20 p-3 align-top text-ash">
                    {row.label}
                    {!allEqual && <span className="ml-1 text-snow">•</span>}
                  </td>
                  {values.map((v, i) => (
                    <td
                      key={i}
                      onClick={() => v && copyText(v)}
                      className={`cursor-copy whitespace-pre-wrap break-words border-b border-l border-charcoal/20 p-3 align-top ${
                        allEqual ? "text-ash" : "font-medium text-snow"
                      }`}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-center text-xs text-charcoal">
        Rows that differ are highlighted. Click any cell to copy.
      </p>
    </div>
  );
}
