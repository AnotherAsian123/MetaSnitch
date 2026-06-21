import type { DirEntry, HistoryEntry, IndexEntry, Metadata, SeedCluster } from "./types";

const BASE = "/api";

async function getJSON<T>(url: string, method = "GET"): Promise<T> {
  const res = await fetch(url, { method });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(data.detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const q = (s: string) => encodeURIComponent(s);

export const api = {
  health: () => getJSON<{ status: string; version: string }>(`${BASE}/health`),
  roots: () => getJSON<DirEntry[]>(`${BASE}/roots`),
  browse: (path: string, sort: string) =>
    getJSON<{ path: string; parent: string | null; entries: DirEntry[] }>(
      `${BASE}/browse?path=${q(path)}&sort=${q(sort)}`,
    ),
  metadata: (path: string) => getJSON<Metadata>(`${BASE}/metadata?path=${q(path)}`),
  search: (
    path: string,
    opts: { q?: string; model?: string; sampler?: string; seed?: string; sort?: string },
  ) => {
    const params = new URLSearchParams({ path });
    Object.entries(opts).forEach(([k, v]) => v && params.set(k, String(v)));
    return getJSON<IndexEntry[]>(`${BASE}/search?${params.toString()}`);
  },
  seeds: (path: string, proximity = 0) =>
    getJSON<SeedCluster[]>(`${BASE}/seeds?path=${q(path)}&proximity=${proximity}`),
  compare: (paths: string[]) =>
    getJSON<Metadata[]>(`${BASE}/compare?paths=${q(paths.join(","))}`),
  getTags: (path: string) =>
    getJSON<{ favorite: boolean; tags: string[]; path: string }>(`${BASE}/tags?path=${q(path)}`),
  setTags: async (path: string, body: { favorite?: boolean; tags?: string[] }) => {
    const res = await fetch(`${BASE}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, ...body }),
    });
    if (!res.ok) throw new Error("Couldn't save tags");
    return res.json();
  },
  parseFile: async (file: File): Promise<Metadata> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/parse`, { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(data.detail || "Couldn't parse image");
    }
    return res.json() as Promise<Metadata>;
  },
  uploadFile: async (file: File): Promise<{ path: string; name: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/upload`, { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(data.detail || "Couldn't upload image");
    }
    return res.json();
  },
  history: () => getJSON<HistoryEntry[]>(`${BASE}/history`),
  addHistory: async (path: string, count?: number) => {
    const res = await fetch(`${BASE}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, count }),
    });
    if (!res.ok) throw new Error("Couldn't record folder");
    return res.json() as Promise<HistoryEntry>;
  },
  removeHistory: (path: string) =>
    getJSON<HistoryEntry[]>(`${BASE}/history?path=${q(path)}`, "DELETE"),
  thumbUrl: (path: string) => `${BASE}/thumb?path=${q(path)}`,
  imageUrl: (path: string) => `${BASE}/image?path=${q(path)}`,
  exportUrl: (path: string, fmt: string) => `${BASE}/export?path=${q(path)}&fmt=${fmt}`,
};
