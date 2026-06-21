import { useState } from "react";
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

type Mode = "both" | "images" | "values";

export interface CompareEntry {
  label: string;
  md: Metadata;
  src: string;
}

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
  entries: CompareEntry[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("both");
  const cols = `repeat(${entries.length}, minmax(14rem, 1fr))`;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black/95 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-snow">
          Compare <span className="text-ash">({entries.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-charcoal/50 text-xs">
            {(["both", "images", "values"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  mode === m ? "bg-snow text-black" : "text-ash hover:text-snow"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-charcoal/50 p-2 text-snow hover:border-ash"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto">
        {/* Image previews — side by side */}
        {mode !== "values" && (
          <div className="grid gap-3" style={{ gridTemplateColumns: cols }}>
            {entries.map((e, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div
                  className={`flex w-full items-center justify-center rounded-xl border border-charcoal/40 bg-black/40 ${
                    mode === "images" ? "h-[60vh]" : "h-64"
                  }`}
                >
                  <img
                    src={e.src}
                    alt={e.label}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                </div>
                <span className="line-clamp-1 text-center text-xs text-ash" title={e.label}>
                  {e.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Parameter diff table */}
        {mode !== "images" && (
          <div className="overflow-x-auto rounded-xl border border-charcoal/40">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-carbon">
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
        )}
      </div>
      <p className="mt-2 text-center text-xs text-charcoal">
        Differing rows are highlighted · click any cell to copy · toggle Images / Values above.
      </p>
    </div>
  );
}
