# MetaSnitch

**See how any AI image was made.** MetaSnitch reads the generation metadata
embedded in AI-generated images — Stable Diffusion, HiDream, **ComfyUI**, and
**A1111 / Forge** — and shows the seed, model, sampler, CFG, denoise, prompts and
the full workflow in a clean, fast UI. Self-hosted, Docker-first, Unraid-ready.

![MetaSnitch](frontend/public/icon.svg)

## Features

- **Drag-and-drop a single image** from anywhere → instant metadata. Works in
  every browser.
- **Browse a server folder** (mounted Unraid shares) as a virtualized thumbnail
  **gallery**, or **pick a folder on your device** (Chromium, Firefox & Safari).
- **Lightbox + metadata sidebar** — important fields (seed, model, sampler,
  denoise…) pinned first; complex parameters nested and collapsible; the full
  raw graph always kept and copyable.
- **ComfyUI custom nodes & arbitrary workflows** — a type-agnostic graph walker
  resolves the decoupled `RandomNoise`/`BasicScheduler`/`KSamplerSelect`/
  `CFGGuider` stack and unknown custom samplers, reports the custom node packs it
  found, and never errors on nodes it doesn't recognize.
- **Sort** by date (default), name, size, model or seed, and **search/filter** by
  model, sampler, seed or prompt text (lazy folder index).
- **Seed analysis** — group images by shared seed and see how the other settings
  varied across them.
- **Side-by-side compare** two or more images' parameters, differences
  highlighted.
- **Copy as A1111 string** and **download original (metadata intact)** — the easy
  path for re-generating or sharing to CivitAI.
- **Export** a folder's metadata to CSV / JSON. **Favorites & tags.**
- **Smart prefetch** of neighbouring images (±2) so navigation is instant, with a
  small bounded cache — no bloat.
- **Installable PWA**, responsive down to mobile, sleek dark UI.

## Supported formats

PNG, JPG/JPEG, WebP, AVIF, GIF, BMP, TIFF — metadata read from PNG text chunks
(`tEXt`/`zTXt`/`iTXt`), EXIF (`UserComment`/`ImageDescription`) and XMP.
Unrecognized generators still display via a raw key-value fallback.

## Quick start (Docker Compose)

```bash
git clone https://github.com/AnotherAsian123/MetaSnitch.git
cd MetaSnitch
# Edit docker-compose.yml: point the read-only /data volume at your images.
docker compose up -d
# open http://localhost:8068
```

## Unraid

1. **Docker → Add Container → Template:** import
   [`unraid/metasnitch.xml`](unraid/metasnitch.xml) (or paste the repo URL in
   Community Applications once published).
2. Set the **Image Library** path to your AI output share (mounted **read-only**)
   and leave **Appdata** at `/mnt/user/appdata/metasnitch`.
3. Apply, then open the WebUI on the mapped port (default **8068**).

The container runs as `99:100` (`nobody:users`) via `--user`, stores all state in
`/config`, and never writes to your image shares.

### Two ways to load images

| Mode | How | Best for |
|---|---|---|
| **Server folder** (primary) | Browse shares mounted into the container | Your library on the array; works on phones / any device |
| **Local folder / drop** | Pick a folder or drag images from this device | A folder that isn't on the server |

Search and seed analysis use the server-side index, so they apply to **server
folders**; local-folder mode supports gallery, lightbox, metadata, compare and
copy/download (name filtering only).

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `METASNITCH_SCAN_ROOTS` | `/data` | Comma-separated folders allowed for browsing |
| `METASNITCH_CONFIG_DIR` | `/config` | Appdata: cache, logs, uploads, tags |
| `METASNITCH_METADATA_CACHE_SIZE` | `256` | LRU size for parsed metadata |
| `METASNITCH_THUMB_SIZE` | `320` | Thumbnail max edge (px) |
| `METASNITCH_LOG_LEVEL` | `INFO` | `DEBUG`/`INFO`/`WARNING`/`ERROR` |

Logs are written to `/config/logs/metasnitch.log` and `failed_parses.log`.

## Development

```bash
# Backend (FastAPI) — http://localhost:8000
cd backend
python -m venv .venv && . .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt pytest httpx
$env:METASNITCH_SCAN_ROOTS="C:/path/to/images"      # PowerShell; export on *nix
uvicorn app.main:app --reload

# Frontend (Vite dev server, proxies /api → :8000) — http://localhost:5173
cd frontend
npm install
npm run dev

# Tests
cd backend && pytest -q
```

## Architecture

- **Backend:** Python 3.12 + FastAPI. A parser registry (A1111/Forge, ComfyUI,
  raw fallback) normalizes every generator into one shape; thumbnails, the lazy
  folder index, tags and export are small focused services. See
  [`plan.md`](plan.md) §5 for the parsing design.
- **Frontend:** React + TypeScript + Vite + Tailwind, virtualized gallery, PWA.
- **Container:** multi-stage build (Node → `python:3.12-slim`) serving the SPA and
  API from one image, published to GHCR by GitHub Actions.

## License

MIT
