# MetaSnitch — Plan

A self-hosted web app for **viewing the generation metadata of AI-generated
images** (Stable Diffusion, HiDream, ComfyUI, A1111, and friends). Designed to
run as a single Docker container on an Unraid server, but usable from any
browser on the network.

> This is a planning document. Nothing is built yet. All major decisions are now
> **locked** (see §14) and the approved feature set is in scope (see §13). Build
> is paused pending a final go-ahead.

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
  and **`sd-parsers`**. **Decision (locked):** we write a **thin in-house parser**
  that borrows their format knowledge (zero runtime dep, full control), and only
  fall back to pulling in a library if a format proves too gnarly.

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

## 2. Where the images live — **both models (locked)**

A browser **cannot** read arbitrary folders on a PC — that's sandboxed. We
implement **both** access models, funnelled into **one** server-side parser
(no duplicate parsing logic in JS):

**Option A — Server-side browsing (primary, the Unraid-native model).**
The container has your image shares mounted (e.g. `/mnt/user/AI-Output` →
`/data` read-only). The app browses *server-side* paths, generates thumbnails
server-side, and streams them to any browser on the network. "Just works" for
network paths, shared folders, phones, and any device — nothing installed
client-side.

**Option B — "A folder on my laptop that isn't on the server" (cross-browser).**
The browser reads files locally and **streams the bytes to the server's parser**
— so we reuse the one Python parser. Two pickers, chosen by capability:
- **Chromium** → `showDirectoryPicker()` (File System Access API) for a clean
  folder grant.
- **Firefox / Safari** → `<input type="file" webkitdirectory>` fallback, which
  *does* support folder selection cross-browser (one-time read, not persistent
  access). **So Firefox is supported.**
These local files are parsed on the fly; they are **not** added to the library
unless the user explicitly uploads them (below).

**Upload-to-library (locked → `/config/uploads`).**
A dropped or picked image can be **persisted** so it joins the browsable gallery
(thumbnailed + indexed). Uploads are written to a **writable** `/config/uploads`
location (inside the appdata volume). Your image-library mounts stay **read-only**
— MetaSnitch never writes to your media shares.

**Drag-and-drop of a single image always works in every browser** regardless of
model, satisfying the "drop an image from anywhere" requirement directly.

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
│  GET  /api/browse?path=&sort=  → list dirs/images, sorted (default: date desc)    │
│  GET  /api/thumb?path=         → cached WebP thumbnail (generated on first hit)   │
│  GET  /api/image?path=         → full-size stream                                 │
│  GET  /api/metadata?path=      → parsed, normalized metadata JSON                 │
│  POST /api/parse (multipart)   → parse a dropped/picked image (no disk write)     │
│  POST /api/upload (multipart)  → persist image into /config/uploads, then index   │
│  GET  /api/search?q=&model=…   → query the lazy folder index (model/sampler/seed) │
│  GET  /api/compare?paths=a,b   → aligned param diff for A/B (side-by-side)        │
│  GET  /api/seeds?path=         → group by seed: clusters + cross-param matrix      │
│  GET  /api/export?path=&fmt=   → folder metadata as CSV or JSON                    │
│  GET/POST /api/tags            → favorites/tags (flat JSON in /config)            │
│                                                                                   │
│  ┌──────────────┐  ┌─────────────────────┐  ┌────────────────────────────────┐   │
│  │ Path guard   │  │ Metadata parser     │  │ Caches & index (bounded)       │   │
│  │ (allowlist)  │  │ A1111│Comfy│Forge│…  │  │ • LRU metadata (~256 entries)  │   │
│  └──────────────┘  └─────────────────────┘  │ • Disk thumbnail cache (/config)│  │
│                                              │ • Lazy folder index (sort/search)│ │
│                                              └────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
   mounts:  /data (image shares, :ro)   /config (appdata: cache, logs, settings, uploads, tags)
```

---

## 5. Metadata parsing design

A **parser registry**: each generator gets a small parser implementing
`detect(image) -> bool` and `parse(image) -> NormalizedMetadata`. We try them in
order and fall back to "raw EXIF/text dump" so *something* always shows.

```
parsers/                          # v1 priority: A1111, ComfyUI, Forge
  base.py        # NormalizedMetadata model, registry
  a1111.py       # 'parameters' string -> fields  (also handles Forge: same
                 #   format + a few extra fields; HiDream rides the ComfyUI path)
  comfyui.py     # generic graph walk (custom-node resilient) -> trace key nodes
  raw.py         # fallback: dump all tEXt/EXIF/XMP key-values so nothing is blank
  # --- later (not v1) --- novelai.py / invokeai.py / fooocus.py ; until then
  #     these tools still display via raw.py
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
  "custom_nodes": ["rgthree", "ComfyUI-Impact-Pack"],  // packs detected in graph
  "unresolved_nodes": ["SomeUnknownNode#42"],          // what we couldn't interpret
  "raw": { "parameters": "...", "prompt": {...}, "workflow": {...} }  // collapsed, copyable
}
```

### 5.1 ComfyUI: custom nodes & arbitrary workflows (the hard case)

Most real-world ComfyUI images do **not** use only stock nodes — they use custom
node packs (Impact Pack, rgthree, Efficiency, WAS, Inspire, GGUF/UNET loaders…)
and the modern decoupled sampling stack (`RandomNoise` + `BasicScheduler` +
`KSamplerSelect` + `CFGGuider`/`BasicGuider` instead of one `KSampler`). A parser
that hardcodes "find the `KSampler` node" would fail on the majority of them.
The design is therefore **type-agnostic and degrades gracefully** — it never
depends on a fixed list of known node classes:

- **Parse the `prompt` (API) graph, not just `workflow`.** The API format inlines
  resolved widget values and uses `{class_type, inputs}` where inputs are either
  literals or `[node_id, slot]` links — far more reliable than positional
  `widgets_values[]` in the UI graph (which drifts as custom nodes change
  versions). We keep `workflow` only for raw display.
- **Find the sink, walk backward generically.** Locate the terminal image node
  (`SaveImage`/`PreviewImage`/`VAEDecode`/any node feeding output) and traverse
  upstream following links through **any** node type — known or not — instead of
  matching specific classes.
- **Extract fields by widget *name*, not node *type*.** Seeds are `seed`/
  `noise_seed`, steps `steps`, cfg `cfg`/`guidance`, sampler `sampler_name`,
  scheduler `scheduler`, denoise `denoise`, etc. A custom sampler we've never
  seen is still mined correctly if it uses conventional input names. The node
  closest to the sink wins for the `summary` (so a `FaceDetailer`'s internal
  sampler doesn't override the main one).
- **Resolve the decoupled/advanced stack** by aggregating across the upstream
  cluster: seed from `RandomNoise`, steps/denoise from `BasicScheduler`, sampler
  from `KSamplerSelect`, cfg + model + conditioning from `CFGGuider`/`BasicGuider`.
- **Follow reroutes & invisible wiring.** Skip through rgthree `Reroute`/
  `Get`/`Set` nodes transparently, and do a type-matching second pass for
  `Anything Everywhere`-style broadcasts (which provide inputs with *no* link in
  the graph) so model/conditioning still resolve.
- **Prompts from any source.** Trace conditioning back through encoders
  (`CLIPTextEncode`, SDXL/Flux/T5 variants, `smZ`, `BNK_*`) and string/primitive/
  wildcard/`ttN` upstreams; combine `ConditioningCombine`/`Concat` inputs.
- **Surface what was used and what we couldn't read.** The output lists detected
  **custom node packs** (inferred from `class_type` names) and a
  `unresolved_nodes` list, so a partially-understood workflow is transparent
  rather than silently wrong.
- **Always keep the full graph.** The complete `prompt` + `workflow` JSON is
  retained in `raw` and shown in a searchable, collapsible node viewer with
  copy-to-clipboard — so even a 100-node graph of entirely unknown nodes is fully
  inspectable and nothing is ever lost.

This is the **graceful-degradation contract**: (1) best case → full resolved
`summary`; (2) partial → the fields we could mine + an explicit list of what we
couldn't, plus the node packs involved; (3) worst case → the raw graph viewer.
The app never errors out or shows blank metadata just because a workflow uses
nodes we don't recognize.

`comfyui.py` is built around this generic graph walker plus a small, *optional*
table of "hints" for popular custom samplers/loaders that refine the summary —
hints only improve results; their absence never breaks parsing. This also handles
the "large amounts of metadata" requirement: huge graphs stay in `raw`,
lazy-rendered and collapsed, so the UI stays fast.

---

## 6. Requirements → how each is met

| Your requirement | Approach |
|---|---|
| Drag-and-drop an image from anywhere | Always-available drop zone. Dropped/"Add images" files are uploaded to `/config/uploads` (persisted across sessions, get real thumbnails) and shown as a server gallery; you can keep adding more. (Local-folder browse still parses in-memory via `POST /api/parse`.) |
| Select a folder, grid of thumbnails | `GET /api/browse` lists the folder; virtualized grid renders server-generated WebP thumbnails. (Model per decision #1.) |
| Click image → expand + metadata sidebar | Lightbox with image left, metadata table right; summary fields pinned at top, complex params nested/collapsible. |
| Important details first (seed, denoise, model…) | `summary` block rendered as a pinned, highlighted table before everything else. |
| Single image fast / instantaneous | Single-file parse is pure metadata read (no full decode) — milliseconds. Cached after first read. |
| Loading animation on directory parse | Skeleton shimmer on thumbnails + a smooth progress indicator while the folder is enumerated (palette-matched, per STYLE.md §5). |
| Smart preloading of neighbors (±2) | On open, prefetch metadata for the next/prev 2 images via TanStack Query so navigation is instant; bounded LRU avoids bloat. |
| Network paths / shared folders | Server-side model reads them as mounted volumes; SMB/NFS paths configurable as scan roots. |
| Multiple formats (png/jpg/webp…) | Pillow + format-aware parsers cover PNG/JPEG/WebP/AVIF; unknown types still get a raw dump. |
| Large amounts of metadata | Summary-first + collapsible groups + lazy raw section keeps render cheap. |
| Custom nodes & arbitrary workflows | Type-agnostic graph walk + widget-name extraction + reroute/broadcast handling; lists detected node packs & unresolved nodes; always keeps the full graph in a searchable raw viewer (see §5.1). Never errors on unknown nodes. |
| Sort gallery (default date) + search/filter | One lazy folder index (built during scan) powers both: default sort = date (newest first), plus name/size/model/dimensions/seed; search & filter by model, sampler, seed, or prompt text (see §6.1). |

### 6.1 Gallery sorting + search/filter (one lazy index)

As a folder is scanned we populate a small in-memory index: `path → {date,
size, dims, model, sampler, seed, prompt}`. This single structure serves both
needs with no extra passes:
- **Sort** — **default: date, newest first** (uses embedded generation date when
  present, else file mtime). Other options: name, size, model, dimensions, seed.
- **Search / filter** — free-text over prompt, plus structured filters by model,
  sampler, or seed. Built *lazily* (only fields needed for the index are read up
  front; full metadata still parses on demand/prefetch), and bounded so big
  folders stay light. Index is per-session in memory — no DB.

### 6.2 Seed analysis (how a seed behaves across prompts & settings)

Built on the same index + compare engine. **Important caveat baked into the
design:** numerically-close seeds are *not* visually related in diffusion, so the
default groups by **exact seed**; numeric-proximity is an optional mode clearly
labelled as such.

- **Group / cluster by seed** — collapse the gallery into seed groups; **sort
  groups by size** (most-reused seeds first) or by seed value. Each group shows
  its thumbnails together.
- **Seed study view** — pick a seed (or group) → a matrix of every image using
  it, with a **parameter-diff table** showing exactly *what varied* (prompt, cfg,
  steps, sampler, scheduler, model, denoise) and what stayed fixed — the seed
  held constant while other knobs change. This is the A/B-tuning insight you're
  after, generalized to N images.
- **Pivot the other way** — hold a prompt (or model) constant and lay images out
  *by seed* to see seed-to-seed variation under fixed settings (an X/Y-plot feel).
- **Optional numeric-proximity grouping** — bucket seeds within ±N of each other,
  with an inline note that proximity ≠ visual similarity (off by default).
- **Cheap** — all of this reads from the in-memory index (group-by on a field we
  already have); full metadata still loads lazily/prefetched only for the images
  on screen. New endpoint: `GET /api/seeds?path=` → seed clusters + cross-param
  matrix.

---

## 7. Performance & caching (STYLE.md §2 — no bloat)

- **Thumbnails:** server images → WebP thumbnails generated once on first
  request, written to `/config/thumbnails` keyed by path+mtime+size, served
  thereafter. Generation uses **libvips** (`pyvips`) — shrink-on-load,
  multi-threaded, ~10x faster than Pillow — with an automatic tuned-Pillow
  fallback (`draft()`/`reducing_gap` shrink-on-load) when libvips is absent. Local-folder images → downscaled **client-side** to a small WebP
  via `createImageBitmap` + `OffscreenCanvas` (lazy, on-screen cells only,
  bounded self-revoking cache) so huge folders scroll smoothly instead of
  decoding full-resolution files per cell.
- **Metadata LRU:** small in-memory cache (default ~256 entries, env-tunable),
  keyed by path+mtime. Re-parses automatically if a file changes.
- **Neighbor prefetch:** exactly ±2 around the focused image — not the whole
  folder — to stay light.
- **Directory scan:** streamed/paginated listing so a 10k-image folder doesn't
  block; grid virtualization means only visible thumbnails mount.
- **Single-image parse:** reads only header/metadata chunks, never fully decodes
  pixels. (The expensive whole-image "stealth-LSB" read is a NovelAI-only concern
  and is **not in v1** — see §13.)

---

## 8. UI / UX (STYLE.md)

- **Palette as tokens:** `#08090A` base, `#222823` carbon surfaces, `#575A5E`
  charcoal borders, `#A7A2A9` lilac-ash secondary text, `#F4F7F5` snow primary
  text. Dark, sleek, minimal.
- **Layout:** top — drop zone + "open folder" (server / local) + breadcrumb path
  + **toolbar (sort selector, search box, filter chips)**. Center — virtualized
  thumbnail grid. Click → lightbox (image + right metadata sidebar; on mobile the
  sidebar becomes a bottom sheet → STYLE.md §1 responsive).
- **Bold focus:** the summary params (seed/model/denoise) get the strongest
  contrast; raw blobs are de-emphasized and collapsed.
- **Motion:** smooth lightbox open, crossfade thumbnails on load, momentum-free
  smooth scroll, no layout jank (STYLE.md §5).
- **Quality-of-life:** click any value to copy; **"copy as A1111 string"** and
  **"download original (metadata intact)"** buttons; **multi-select → compare**
  two images side-by-side with differences highlighted; **favorite/tag** toggle;
  **export folder → CSV/JSON**; keyboard arrows to navigate (drives the ±2
  prefetch). Installable as a **PWA** for a native feel on mobile.

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
│  │  ├─ routes/          # browse, thumb, image, metadata, parse, upload,
│  │  │                   #   search, compare, export, tags, health
│  │  ├─ parsers/         # registry + per-generator parsers
│  │  ├─ services/        # thumbnails, scan, index, cache, path-guard, tags
│  │  ├─ core/            # config (env), logging (dual-variation)
│  │  └─ models.py        # NormalizedMetadata
│  ├─ tests/              # parser tests w/ real sample images
│  └─ pyproject.toml
└─ frontend/
   ├─ src/{components,hooks,api,styles}/
   ├─ index.html  vite.config.ts  tailwind.config.ts
   ├─ manifest.webmanifest  sw.ts   # PWA: installable + offline shell
   └─ package.json
```

---

## 12. Build phases (everything at once — each still verifiable, CLAUDE.md §4)

Scope of v1 = the whole app in one build-out (decision #3). Phases are the build
*order*, not separate releases:

1. **Scaffold + Docker + CI** → `docker compose up` serves SPA + `/api/health`;
   GHCR workflow in place (watched green per CLAUDE.md).
2. **Parser core (in-house)** → unit tests parse real A1111/Forge + ComfyUI
   samples (incl. custom-node graphs) into `NormalizedMetadata` (verify: tests
   green).
3. **Single-image path** → drag-drop / local-pick one image → correct metadata
   (verify: A1111 PNG + ComfyUI PNG + a WebP, summary correct).
4. **Folder browse + thumbnails + grid + index** → server (Option A) and local
   (Option B, incl. Firefox `webkitdirectory`); virtualized grid, cached
   thumbnails, loading animation; lazy index built during scan.
5. **Sort + search/filter** → default date sort + other options; search by
   model/sampler/seed/prompt (§6.1).
6. **Lightbox + sidebar + ±2 prefetch** → click→expand, arrow-key nav instant.
7. **Power features** → upload-to-`/config/uploads`, copy-as-A1111, download
   original (metadata intact), side-by-side compare, **seed analysis (§6.2)**,
   favorites/tags, export CSV/JSON, `.deut`-style sidecar export.
8. **Polish + PWA** → palette, animations, responsive/mobile bottom-sheet,
   installable PWA.
9. **Unraid template** → Community Apps XML validated (mounts, PUID/PGID, env).

---

## 13. Feature set

### In scope for v1 (approved)
- **Sort gallery** — default **date (newest first)**, plus name/size/model/
  dimensions/seed (§6.1).
- **Search & filter** by model, sampler, seed, or prompt text — lazy index (§6.1).
- **Side-by-side compare** two images' parameters, differences highlighted.
- **Copy as A1111 string** — re-serialize any image's params (incl. ComfyUI) into
  the A1111 paste format for re-generation.
- **Download original (metadata intact)** — also the practical path for sharing to
  CivitAI, whose uploader auto-parses A1111 metadata.
- **Export** a folder's metadata to CSV / JSON.
- **Favorites / tags** persisted in `/config` (flat JSON, no DB), keyed by a
  stable file fingerprint so they survive moves/renames where possible.
- **PWA / installable** for a native feel on mobile (STYLE.md §1).
- **`.deut`-style sidecar export** — share prompt/params without the image.
- **Upload-to-library** → persists into `/config/uploads` (decision below).
- **Seed analysis** — group/cluster a folder by seed and study how a shared seed
  behaves across different prompts and settings (see §6.2).

### Later (not v1)
- **CivitAI deep integration** — a true one-click "publish" is unreliable (their
  API is mostly read/download + auth-gated). Deferred; the two building blocks
  above (copy-as-A1111 + download-with-metadata) already make CivitAI sharing
  easy. Revisit if their API allows it.
- **NovelAI / InvokeAI / Fooocus** dedicated parsers (they display via `raw.py`
  until then), and with NovelAI the **stealth-LSB** read.
  - *Stealth-LSB, plainly:* some tools hide metadata **inside the pixels** (tiny,
    invisible tweaks to color/alpha bits) instead of the file header, so it
    survives metadata stripping. Reading it means decoding the whole image —
    comparatively slow — which is why it'd be an off-by-default toggle, and why
    it's deferred with NovelAI.

---

## 14. Decisions — **locked**

1. **Folder access model** → **both** (§2). Option A server-side (primary) +
   Option B local-folder picker, cross-browser via `showDirectoryPicker()`
   (Chromium) and `webkitdirectory` (Firefox/Safari). Local files stream to the
   one server-side parser.
2. **Parsing approach** → **thin in-house parser** that borrows
   `sd-prompt-reader`/`sd-parsers` format knowledge; pull in a lib only if a
   format proves too gnarly.
3. **Scope of v1** → **everything at once** (full app + dual-variation logging +
   GHCR CI + Unraid template + PWA + all §13 in-scope features).
4. **Generators** → **A1111, ComfyUI, Forge** (Forge = A1111 format + extras;
   HiDream rides ComfyUI). Everything else displays via the `raw.py` fallback.
5. **Upload target** → **`/config/uploads`** (writable, in appdata). Image-library
   mounts stay read-only.

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
