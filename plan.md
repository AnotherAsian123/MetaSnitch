# MetaSnitch — Plan

A self-hosted web app for **viewing the generation metadata of AI-generated
images** (Stable Diffusion, HiDream, ComfyUI, A1111, and friends). Designed to
run as a single Docker container on an Unraid server, but usable from any
browser on the network.

> This is a planning document. Nothing is built yet. The bottom of this file
> lists **open decisions** that change the architecture — please confirm those
> before I start coding.

---

## 1. Research summary

### 1a. How AI image metadata is actually stored

The hard part of this app is parsing, because every tool writes metadata
differently. Findings from research:

| Generator | Container | Where | Format |
|---|---|---|---|
| **A1111 / Forge** | PNG | `tEXt` chunk named `parameters` | One flat string: `prompt \n Negative prompt: ... \n Steps: 20, Sampler: ..., CFG scale: 7, Seed: 123, Model: ...` |
| **A1111 / Forge** | JPEG / WebP | EXIF `UserComment` (tag 0x9286) | Same flat string as above (sometimes with a `UNICODE` prefix) |
| **ComfyUI** | PNG | `tEXt` chunks `prompt` (API graph) **and** `workflow` (UI graph) | Full JSON node graph — every node, link, and widget value |
| **ComfyUI** | JPEG / WebP | EXIF / XMP | JSON workflow embedded in EXIF or XMP |
| **NovelAI** | PNG | `Comment` `tEXt` chunk + **stealth LSB** in the alpha channel | JSON; some images hide it in pixel data |
| **InvokeAI** | PNG | `tEXt` chunks `invokeai_metadata` / `sd-metadata` / `dream` | JSON |
| **Fooocus** | PNG | `tEXt` chunk `parameters` or `fooocus_scheme` | JSON or A1111-style |
| **HiDream** | PNG/JPEG | Usually produced **via ComfyUI** | ComfyUI workflow JSON (treat as ComfyUI) |

Key technical points:
- PNG metadata lives in `tEXt` (plain), `zTXt` (zlib-compressed), or `iTXt`
  (UTF-8) chunks. We must read all three.
- JPEG/WebP use **EXIF** (`UserComment`, `ImageDescription`) and sometimes
  **XMP**. WebP can hold an EXIF chunk too.
- ComfyUI's `prompt` graph is the *executed* API format (reliable for
  extracting real values); `workflow` is the editor layout (good for display).
  We parse `prompt` for parameters and keep `workflow` available raw.
- The mature reference implementations are the Python libs **`sd-prompt-reader`**
  and **`sd-parsers`** — both handle the multi-format detection problem and are
  good blueprints (and possible dependencies) rather than reinventing it.

### 1b. Unraid / Docker best practices

- **One job, one container.** Ship a single image that serves both the API and
  the built frontend (FastAPI serving static files). Simplest to template on
  Unraid's Community Apps.
- **All state outside the image.** Settings, the thumbnail cache, and logs go in
  a bind-mounted `appdata` volume (`/config`), never inside the container layer,
  so the image can be recreated without data loss.
- **Configure via environment variables** (port, cache size, scan roots, log
  level) — no hardcoded host-specific values.
- **Read-only mounts for image sources.** The Unraid shares holding the images
  are mounted **read-only** (`:ro`) — MetaSnitch only reads metadata, it never
  writes to your library. This also covers network paths / shared folders, since
  Unraid mounts those into the container path.
- **Run as PUID/PGID `99:100`** (the Unraid `nobody:users` convention) so files
  are accessed with correct, non-root permissions.
- **Healthcheck + small base image** (`python:3.12-slim`) keep it lean and
  Unraid-dashboard-friendly.
- Publish via GitHub Actions to GHCR (matches the existing
  `ghcr.io/anotherasian123` convention in CLAUDE.md).

---

## 2. The pivotal design decision: where do the images live?

A browser **cannot** read arbitrary folders on a PC — that's sandboxed. There
are two viable models, and this choice shapes the whole app:

**Option A — Server-side browsing (recommended for Unraid).**
The container has your image shares mounted (e.g. `/mnt/user/AI-Output` →
`/data` read-only). The app browses *server-side* paths, generates thumbnails
server-side, and streams them to any browser on the network. This is the natural
Unraid model: the images live on the array, and it "just works" for network
paths, shared folders, phones, and any device — nothing is installed client-side.

**Option B — Client-side folder picker (File System Access API).**
Modern Chromium browsers expose `showDirectoryPicker()`, letting the user grant
the page access to a folder *on the machine running the browser*. Parsing happens
in the browser. Works without mounting anything, but: Chromium-only (no Firefox/
Safari, no iOS), and it reads the *client's* disk — not the server's library.

**Recommendation:** Build **Option A as the primary** experience (it's what an
Unraid app should be), and add **Option B as a progressive enhancement** for the
"a folder on my laptop that isn't on the server" case. **Drag-and-drop of a
single image always works in every browser** regardless of model, satisfying the
"drop an image from anywhere" requirement directly.

👉 *This is open decision #1 below.*

---

## 3. Proposed tech stack

| Layer | Choice | Why |
|---|---|---|
| **Backend** | **Python 3.12 + FastAPI + Uvicorn** | The entire mature AI-metadata parsing ecosystem (`sd-prompt-reader`, `sd-parsers`, Pillow, piexif) is Python. Async, tiny, fast. |
| **Image / thumbnails** | **Pillow** (+ `pillow-avif`/`pillow-heif` optional) | Reads PNG chunks, EXIF, generates WebP thumbnails. |
| **Frontend** | **React 18 + TypeScript + Vite** | Fast, modern, great for the gallery + lightbox + virtualized grid. |
| **Styling** | **Tailwind CSS** w/ the STYLE.md palette as design tokens | Minimal, responsive, no heavy UI framework overhead. |
| **Grid performance** | **`@tanstack/react-virtual`** | Virtualized gallery → thousands of thumbnails without DOM bloat. |
| **Data fetching** | **TanStack Query** | Built-in caching, background refetch, prefetching of neighbors. |
| **Container** | Multi-stage Dockerfile (Node build → slim Python runtime) | One lean image serving API + static SPA. |

Rationale per STYLE.md §2 (low overhead): no Electron, no SSR framework, no
database — metadata is read on demand and held in a small bounded cache.

---

## 4. Architecture

```
┌────────────────────────── Browser (any device on LAN) ──────────────────────────┐
│  React SPA                                                                        │
│  • Drag-drop zone   • Virtualized thumbnail grid   • Lightbox + metadata sidebar  │
│  • TanStack Query cache + ±2 neighbor prefetch                                    │
└───────────────▲───────────────────────────────────────────────▲─────────────────┘
                │ REST/JSON                                       │ image/webp
┌───────────────┴───────────────────────────────────────────────┴─────────────────┐
│  FastAPI (Uvicorn)                                                                │
│  GET /api/browse?path=        → list dirs/images (sandboxed to allowed roots)     │
│  GET /api/thumb?path=         → cached WebP thumbnail (generated on first hit)    │
│  GET /api/image?path=         → full-size stream                                  │
│  GET /api/metadata?path=      → parsed, normalized metadata JSON                  │
│  POST /api/parse (multipart)  → parse a dropped/uploaded image (no disk write)    │
│                                                                                   │
│  ┌──────────────┐  ┌─────────────────────┐  ┌────────────────────────────────┐   │
│  │ Path guard   │  │ Metadata parser     │  │ Caches (bounded)               │   │
│  │ (allowlist)  │  │ A1111│Comfy│NAI│...  │  │ • LRU metadata (~256 entries)  │   │
│  └──────────────┘  └─────────────────────┘  │ • Disk thumbnail cache (/config)│  │
│                                              └────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
        mounts:  /data (image shares, :ro)      /config (appdata: cache, logs, settings)
```

---

## 5. Metadata parsing design

A **parser registry**: each generator gets a small parser implementing
`detect(image) -> bool` and `parse(image) -> NormalizedMetadata`. We try them in
order and fall back to "raw EXIF/text dump" so *something* always shows.

```
parsers/
  base.py        # NormalizedMetadata model, registry
  a1111.py       # 'parameters' string  -> fields
  comfyui.py     # 'prompt'/'workflow' JSON graph -> trace key nodes
  novelai.py     # Comment chunk + stealth-LSB fallback
  invokeai.py
  fooocus.py
  raw.py         # last-resort: dump all tEXt/EXIF/XMP key-values
```

**Normalized output** (so the UI is consistent across tools). Important fields
surface first (per your requirement), the rest nest:

```jsonc
{
  "source": "ComfyUI",                 // detected generator
  "summary": {                          // ALWAYS shown first, prominently
    "model": "...", "seed": 123,
    "sampler": "...", "scheduler": "...",
    "steps": 20, "cfg": 7.0,
    "denoise": 0.6, "size": "1024x1024"
  },
  "prompt": "…", "negative_prompt": "…",
  "loras": [...], "vae": "...", "model_hash": "...",
  "groups": {                           // collapsible nested sections
    "Generation": {...}, "Model": {...}, "Upscale/Hires": {...}
  },
  "raw": { "parameters": "...", "workflow": {...} }  // collapsed, copyable
}
```

For **ComfyUI** we walk the graph: find the `KSampler`(/variants) node and trace
its inputs back through the graph to resolve seed, steps, cfg, sampler,
scheduler, denoise, the `CheckpointLoader` model, and `CLIPTextEncode` prompts —
rather than dumping raw node IDs. Unknown/custom nodes fall into `raw.workflow`.

Handles your "large amounts of metadata" requirement: huge workflows are kept in
`raw` (lazy-rendered, collapsed, with copy-to-clipboard) so the UI stays fast.

---

## 6. Requirements → how each is met

| Your requirement | Approach |
|---|---|
| Drag-and-drop an image from anywhere | Always-available drop zone → `POST /api/parse` (in-memory, no disk write) → instant metadata. |
| Select a folder, grid of thumbnails | `GET /api/browse` lists the folder; virtualized grid renders server-generated WebP thumbnails. (Model per decision #1.) |
| Click image → expand + metadata sidebar | Lightbox with image left, metadata table right; summary fields pinned at top, complex params nested/collapsible. |
| Important details first (seed, denoise, model…) | `summary` block rendered as a pinned, highlighted table before everything else. |
| Single image fast / instantaneous | Single-file parse is pure metadata read (no full decode) — milliseconds. Cached after first read. |
| Loading animation on directory parse | Skeleton shimmer on thumbnails + a smooth progress indicator while the folder is enumerated (palette-matched, per STYLE.md §5). |
| Smart preloading of neighbors (±2) | On open, prefetch metadata for the next/prev 2 images via TanStack Query so navigation is instant; bounded LRU avoids bloat. |
| Network paths / shared folders | Server-side model reads them as mounted volumes; SMB/NFS paths configurable as scan roots. |
| Multiple formats (png/jpg/webp…) | Pillow + format-aware parsers cover PNG/JPEG/WebP/AVIF; unknown types still get a raw dump. |
| Large amounts of metadata | Summary-first + collapsible groups + lazy raw section keeps render cheap. |

---

## 7. Performance & caching (STYLE.md §2 — no bloat)

- **Thumbnails:** generated once on first request, written to `/config/thumbnails`
  keyed by path+mtime+size, served thereafter. Background-task generation so the
  grid paints immediately with skeletons.
- **Metadata LRU:** small in-memory cache (default ~256 entries, env-tunable),
  keyed by path+mtime. Re-parses automatically if a file changes.
- **Neighbor prefetch:** exactly ±2 around the focused image — not the whole
  folder — to stay light.
- **Directory scan:** streamed/paginated listing so a 10k-image folder doesn't
  block; grid virtualization means only visible thumbnails mount.
- **Single-image parse:** reads only header/metadata chunks, never fully decodes
  pixels (except NovelAI stealth-LSB fallback, which is opt-in).

---

## 8. UI / UX (STYLE.md)

- **Palette as tokens:** `#08090A` base, `#222823` carbon surfaces, `#575A5E`
  charcoal borders, `#A7A2A9` lilac-ash secondary text, `#F4F7F5` snow primary
  text. Dark, sleek, minimal.
- **Layout:** top — drop zone + "open folder" + breadcrumb path. Center —
  virtualized thumbnail grid. Click → lightbox (image + right metadata sidebar;
  on mobile the sidebar becomes a bottom sheet → STYLE.md §1 responsive).
- **Bold focus:** the summary params (seed/model/denoise) get the strongest
  contrast; raw blobs are de-emphasized and collapsed.
- **Motion:** smooth lightbox open, crossfade thumbnails on load, momentum-free
  smooth scroll, no layout jank (STYLE.md §5).
- **Quality-of-life:** click any value to copy; "copy all parameters" button;
  keyboard arrows to navigate (drives the ±2 prefetch).

---

## 9. Logging (CLAUDE.md mandate — both variations)

Every failure is logged twice:
- **Frontend (summarized):** friendly toast, e.g. *"Couldn't read metadata for
  image.webp — it may be an unsupported format. See the log file for details."*
- **Backend (detailed):** full traceback, file path, detected format, chunk/EXIF
  dump, exit context → `/config/logs/metasnitch.log` (+ a `failed_parses.log`),
  produced at the point of failure.

---

## 10. Docker / Unraid deployment

- Multi-stage `Dockerfile`: stage 1 builds the React SPA (Node); stage 2 is
  `python:3.12-slim` running Uvicorn and serving the built static files + API.
- `docker-compose.yml` for local dev; an **Unraid Community Apps XML template**
  with: WebUI port, `/config` (appdata) mount, one or more `/data` (`:ro`) image
  mounts, `PUID/PGID`, and env vars (cache size, log level, scan roots).
- `HEALTHCHECK` hits `/api/health`.
- GitHub Actions (`docker-publish.yml`) builds and pushes
  `ghcr.io/anotherasian123/metasnitch:latest` on push to `main` / tags — and per
  CLAUDE.md I'll watch the run go green and fix until it is.

---

## 11. Project structure

```
MetaSnitch/
├─ plan.md                # this file
├─ README.md
├─ CLAUDE.md  STYLE.md    # existing
├─ .gitignore             # incl. Prompt.txt
├─ docker-compose.yml
├─ Dockerfile
├─ .github/workflows/docker-publish.yml
├─ backend/
│  ├─ app/
│  │  ├─ main.py          # FastAPI app + static serving
│  │  ├─ routes/          # browse, thumb, image, metadata, parse, health
│  │  ├─ parsers/         # registry + per-generator parsers
│  │  ├─ services/        # thumbnails, scan, cache, path-guard
│  │  ├─ core/            # config (env), logging (dual-variation)
│  │  └─ models.py        # NormalizedMetadata
│  ├─ tests/              # parser tests w/ real sample images
│  └─ pyproject.toml
└─ frontend/
   ├─ src/{components,hooks,api,styles}/
   ├─ index.html  vite.config.ts  tailwind.config.ts
   └─ package.json
```

---

## 12. Build phases (each ends verifiable — CLAUDE.md §4)

1. **Repo + scaffold** → `docker compose up` serves an empty SPA + `/api/health`.
2. **Parser core** → unit tests parse real A1111 + ComfyUI samples into
   `NormalizedMetadata` (verify: tests green).
3. **Single-image path** → drag-drop one image, see correct metadata (verify:
   drop A1111 PNG + ComfyUI PNG + a WebP, summary fields correct).
4. **Folder browse + thumbnails + grid** → open a folder, virtualized grid with
   cached thumbnails + loading animation.
5. **Lightbox + sidebar + ±2 prefetch** → click→expand, arrow-key nav instant.
6. **Polish** → palette, animations, responsive/mobile, copy buttons.
7. **Dockerize + CI** → GHCR image green; Unraid template validated.

---

## 13. Suggested improvements / missing features (my additions)

- **Search & filter** the gallery by model, sampler, seed, or prompt text
  (indexed lazily as folders are scanned).
- **Side-by-side compare** two images' parameters (great for A/B tuning).
- **"Send to clipboard as A1111 string"** — re-serialize any image's params into
  the A1111 paste format for re-generation.
- **Stealth-LSB toggle** for NovelAI (off by default; it's the only expensive
  read).
- **Duplicate/near-identical seed detection** within a folder.
- **Export** a folder's metadata to CSV/JSON for analysis.
- **Favorites / tags** persisted in `/config` (no DB — flat JSON).
- **PWA / installable** so it feels native on mobile (STYLE.md §1).
- **`.deut`-style sidecar export** for sharing prompts without the image.

These are proposals — none are in scope unless you say so (CLAUDE.md §2).

---

## 14. Open decisions (need your call before I build)

1. **Folder access model** — Option A (server-side, mounted Unraid shares,
   recommended), Option B (client-side File System Access API), or **both**?
   This is the biggest architectural fork.
2. **Parsing approach** — depend on the mature `sd-prompt-reader`/`sd-parsers`
   libraries (faster, battle-tested) vs. a lean in-house parser (zero deps, full
   control, more code)? I lean toward a thin in-house core that borrows their
   format knowledge, falling back to a lib only if needed.
3. **Scope of v1** — ship phases 1–6 (full app, run via `docker compose`) first
   and add CI/GHCR/Unraid template (phase 7) after, or do everything in one go?
4. **Generator priority** — confirmed: A1111, ComfyUI, HiDream(=ComfyUI). Want
   NovelAI / InvokeAI / Fooocus in v1 too, or later?

---

### Sources
- [Managing & customizing containers — Unraid Docs](https://docs.unraid.net/unraid-os/using-unraid-to/run-docker-containers/managing-and-customizing-containers/)
- [Run Docker containers — Unraid Docs](https://docs.unraid.net/category/run-docker-containers/)
- [Unraid Docker: Proven Fixes for Stable Performance — CyberPanel](https://cyberpanel.net/blog/unraid-docker)
- [AI Image Metadata Viewer — Prompting Pixels](https://www.promptingpixels.com/metadata)
- [Extract Prompts from ComfyUI Images / .deut standard — DEV](https://dev.to/deutli/how-to-extract-prompts-from-comfyui-images-free-png-parser-the-deut-standard-3c3p)
- [sd-parsers — PyPI](https://pypi.org/project/sd-parsers/)
- [sd-prompt-reader — PyPI](https://pypi.org/project/sd-prompt-reader/)
- [FastAPI Image Optimization — Medium](https://medium.com/@sizanmahmud08/fastapi-image-optimization-a-complete-guide-to-faster-and-smarter-file-handling-38705e5a7b3c)
- [FastAPI Background Tasks — OneUptime](https://oneuptime.com/blog/post/2026-02-02-fastapi-background-tasks/view)
- [FastAPI Best Practices for Production 2026 — FastLaunchAPI](https://fastlaunchapi.dev/blog/fastapi-best-practices-production-2026)
