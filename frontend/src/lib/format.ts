import type { Metadata } from "../types";

/** Re-serialize normalized metadata into the A1111 paste format (also the
 * practical way to share to CivitAI, whose uploader auto-parses it). */
export function toA1111String(md: Metadata): string {
  const s = md.summary;
  const lines: string[] = [];
  if (md.prompt) lines.push(md.prompt);
  if (md.negative_prompt) lines.push(`Negative prompt: ${md.negative_prompt}`);

  const kv: string[] = [];
  const push = (label: string, key: string) => {
    if (s[key] !== undefined && s[key] !== null && s[key] !== "") {
      kv.push(`${label}: ${s[key]}`);
    }
  };
  push("Steps", "steps");
  push("Sampler", "sampler");
  push("Schedule type", "scheduler");
  push("CFG scale", "cfg");
  push("Seed", "seed");
  push("Size", "size");
  push("Model", "model");
  push("Denoising strength", "denoise");
  if (kv.length) lines.push(kv.join(", "));
  return lines.join("\n");
}

export function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function humanDate(mtimeSeconds: number): string {
  if (!mtimeSeconds) return "";
  return new Date(mtimeSeconds * 1000).toLocaleString();
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
