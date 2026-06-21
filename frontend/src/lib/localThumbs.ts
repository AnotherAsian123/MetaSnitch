// Client-side thumbnails for locally-picked folders (Option B), so scrolling a
// huge folder stays smooth instead of decoding full-resolution images per cell.
//
// Best practice: createImageBitmap() decodes asynchronously (off the main
// thread), then we cover-crop to a small WebP via OffscreenCanvas. Generated
// lazily (only for on-screen cells) and held in a bounded, self-revoking cache.

const THUMB_SIZE = 320;
const MAX_CACHE = 600;

const cache = new Map<string, string>(); // item id -> blob object URL
const inflight = new Map<string, Promise<string>>();

export async function getLocalThumb(id: string, file: File, size = THUMB_SIZE): Promise<string> {
  const hit = cache.get(id);
  if (hit) return hit;
  const pending = inflight.get(id);
  if (pending) return pending;

  const job = renderThumb(file, size)
    .then((url) => {
      cache.set(id, url);
      inflight.delete(id);
      evict();
      return url;
    })
    .catch((err) => {
      inflight.delete(id);
      throw err;
    });
  inflight.set(id, job);
  return job;
}

export function disposeLocalThumbs(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}

function evict() {
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const url = cache.get(oldest);
    if (url) URL.revokeObjectURL(url);
    cache.delete(oldest);
  }
}

async function renderThumb(file: File, size: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;
  const scale = Math.max(size / w, size / h); // cover
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const dx = Math.round((size - sw) / 2);
  const dy = Math.round((size - sh) / 2);

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, dx, dy, sw, sh);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
    return URL.createObjectURL(blob);
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, dx, dy, sw, sh);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.8),
  );
  if (!blob) throw new Error("toBlob failed");
  return URL.createObjectURL(blob);
}
