import type { SeedClusterView, SeedItemView } from "../types";

// Client-side seed clustering for local folders — mirrors the backend logic so
// local-folder seed analysis matches server-folder behaviour. proximity=0 means
// exact-seed grouping; proximity>0 buckets numerically-close seeds.
export function clusterBySeed(items: SeedItemView[], proximity: number): SeedClusterView[] {
  const buckets = new Map<string, SeedItemView[]>();
  for (const it of items) {
    if (it.seed == null || it.seed === "") continue;
    let key: string;
    if (proximity > 0) {
      const n = Number(it.seed);
      key = Number.isFinite(n) ? String(Math.floor(n / proximity) * proximity) : "n/a";
    } else {
      key = it.seed;
    }
    const arr = buckets.get(key);
    if (arr) arr.push(it);
    else buckets.set(key, [it]);
  }
  const clusters: SeedClusterView[] = [];
  for (const [seed, arr] of buckets) {
    if (arr.length > 1) clusters.push({ seed, count: arr.length, items: arr });
  }
  clusters.sort((a, b) => b.count - a.count);
  return clusters;
}
