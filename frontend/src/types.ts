export interface Metadata {
  source: string;
  summary: Record<string, unknown>;
  prompt?: string | null;
  negative_prompt?: string | null;
  loras: Array<Record<string, unknown>>;
  groups: Record<string, Record<string, unknown>>;
  custom_nodes: string[];
  custom_node_details: CustomNodeDetail[];
  unresolved_nodes: string[];
  raw: Record<string, unknown>;
  width?: number | null;
  height?: number | null;
  format?: string | null;
}

export interface CustomNodeDetail {
  id: string;
  type: string;
  settings: Record<string, unknown>;
}

export interface HistoryEntry {
  path: string;
  name: string;
  last_opened: number;
  count?: number;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_image: boolean;
  size: number;
  mtime: number;
}

export interface SeedCluster {
  seed: string;
  count: number;
  items: IndexEntry[];
}

// Mode-agnostic shapes the SeedView renders (server paths or local files).
export interface SeedItemView {
  id: string;
  name: string;
  seed: string | null;
  model: string | null;
  sampler: string | null;
  prompt: string | null;
  thumb: string;
}

export interface SeedClusterView {
  seed: string;
  count: number;
  items: SeedItemView[];
}

export interface IndexEntry {
  name: string;
  path: string;
  size: number;
  mtime: number;
  width?: number | null;
  height?: number | null;
  source?: string | null;
  model?: string | null;
  sampler?: string | null;
  seed?: string | null;
  prompt?: string | null;
}

/** Unified gallery item: a server-side file or a locally-picked File. */
export type GalleryItem =
  | { kind: "server"; id: string; name: string; path: string; mtime: number; size: number }
  | { kind: "local"; id: string; name: string; file: File; url: string; mtime: number; size: number };

export type SortKey = "date" | "date-asc" | "name" | "size" | "model" | "seed";
