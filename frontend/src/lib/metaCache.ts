import type { Metadata } from "../types";

// Small bounded cache + de-duped in-flight requests, so navigation is instant
// and neighbor prefetch (±2) stays cheap (plan §7).
const MAX = 256;
const cache = new Map<string, Metadata>();
const inflight = new Map<string, Promise<Metadata>>();

export function getMeta(key: string, loader: () => Promise<Metadata>): Promise<Metadata> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = loader()
    .then((md) => {
      cache.set(key, md);
      inflight.delete(key);
      if (cache.size > MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return md;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}

export function peekMeta(key: string): Metadata | undefined {
  return cache.get(key);
}

export function prefetchMeta(key: string, loader: () => Promise<Metadata>): void {
  if (cache.has(key) || inflight.has(key)) return;
  void getMeta(key, loader).catch(() => undefined);
}
