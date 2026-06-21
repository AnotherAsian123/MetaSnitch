"""Lazy per-folder index that powers sort-by-metadata, search/filter, and seed
analysis (plan §6.1 / §6.2). Built on demand, cached per folder, bounded."""

from __future__ import annotations

import concurrent.futures
import os
import threading
import time
from pathlib import Path

from ..models import IndexEntry
from .metadata import parse_path
from .scan import list_images

# folder path -> (signature, entries, built_at)
_folder_cache: dict[str, tuple[tuple[int, float], list[IndexEntry], float]] = {}
_lock = threading.Lock()
_MAX_FOLDERS = 32  # keep a handful of recently-indexed folders


def _entry_for(p: Path) -> IndexEntry:
    st = p.stat()
    try:
        md = parse_path(str(p))
        s = md.summary
        as_str = lambda v: None if v is None else str(v)
        return IndexEntry(
            name=p.name,
            path=str(p),
            size=st.st_size,
            mtime=st.st_mtime,
            width=md.width,
            height=md.height,
            source=md.source,
            model=as_str(s.get("model")),
            sampler=as_str(s.get("sampler")),
            seed=as_str(s.get("seed")),
            prompt=md.prompt,
        )
    except Exception:
        return IndexEntry(name=p.name, path=str(p), size=st.st_size, mtime=st.st_mtime)


def _signature(images: list[Path]) -> tuple[int, float]:
    if not images:
        return (0, 0.0)
    return (len(images), max(p.stat().st_mtime for p in images))


def build_index(path: Path, force: bool = False) -> list[IndexEntry]:
    images = list_images(path)
    sig = _signature(images)
    key = str(path)

    with _lock:
        cached = _folder_cache.get(key)
    if cached and cached[0] == sig and not force:
        return cached[1]

    workers = min(8, (os.cpu_count() or 4))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        entries = list(pool.map(_entry_for, images))

    with _lock:
        _folder_cache[key] = (sig, entries, time.time())
        while len(_folder_cache) > _MAX_FOLDERS:
            oldest = min(_folder_cache, key=lambda k: _folder_cache[k][2])
            _folder_cache.pop(oldest)
    return entries


def search(
    path: Path,
    q: str | None = None,
    model: str | None = None,
    sampler: str | None = None,
    seed: str | None = None,
    sort: str = "date",
) -> list[IndexEntry]:
    entries = build_index(path)

    def matches(e: IndexEntry) -> bool:
        if q:
            hay = " ".join(filter(None, [e.prompt, e.model, e.sampler, e.seed, e.name])).lower()
            if q.lower() not in hay:
                return False
        if model and (e.model or "").lower().find(model.lower()) < 0:
            return False
        if sampler and (e.sampler or "").lower().find(sampler.lower()) < 0:
            return False
        if seed and (e.seed or "") != seed:
            return False
        return True

    result = [e for e in entries if matches(e)]
    return _sort_entries(result, sort)


def _sort_entries(entries: list[IndexEntry], sort: str) -> list[IndexEntry]:
    keymap = {
        "name": (lambda e: e.name.lower(), False),
        "size": (lambda e: e.size, True),
        "model": (lambda e: (e.model or "").lower(), False),
        "seed": (lambda e: _num(e.seed), False),
        "date-asc": (lambda e: e.mtime, False),
        "date": (lambda e: e.mtime, True),
    }
    key, reverse = keymap.get(sort, keymap["date"])
    return sorted(entries, key=key, reverse=reverse)


def _num(v: str | None) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("inf")


def seed_clusters(path: Path, proximity: int = 0) -> list[dict]:
    """Group images by seed. proximity=0 -> exact match (default).
    proximity>0 -> bucket seeds within +/- N (flagged in UI; not visual similarity)."""
    entries = build_index(path)
    buckets: dict[str, list[IndexEntry]] = {}
    for e in entries:
        if e.seed is None:
            continue
        if proximity > 0:
            n = _num(e.seed)
            bucket_key = "n/a" if n == float("inf") else str(int(n // proximity) * proximity)
        else:
            bucket_key = e.seed
        buckets.setdefault(bucket_key, []).append(e)

    clusters = [
        {
            "seed": k,
            "count": len(v),
            "items": [e.model_dump() for e in v],
        }
        for k, v in buckets.items()
        if len(v) > 1  # a "cluster" needs at least two images sharing the seed
    ]
    clusters.sort(key=lambda c: c["count"], reverse=True)
    return clusters
