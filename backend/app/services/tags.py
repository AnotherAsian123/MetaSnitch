"""Favorites / tags persisted as flat JSON in the appdata volume (no DB).

Keyed by a light content fingerprint (size + first 64 KB) so tags survive moves
and renames where possible."""

from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

from ..core.config import get_settings

_lock = threading.Lock()


def fingerprint(path: Path) -> str:
    st = path.stat()
    h = hashlib.sha1()
    h.update(str(st.st_size).encode())
    with open(path, "rb") as f:
        h.update(f.read(65536))
    return h.hexdigest()


def _load() -> dict:
    f = get_settings().tags_file
    if f.exists():
        try:
            return json.loads(f.read_text("utf-8"))
        except (ValueError, OSError):
            return {}
    return {}


def _save(data: dict) -> None:
    f = get_settings().tags_file
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=2), "utf-8")


def get_tags(path: Path) -> dict:
    entry = _load().get(fingerprint(path))
    return entry or {"favorite": False, "tags": [], "path": str(path)}


def set_tags(path: Path, favorite: bool | None = None, tags: list[str] | None = None) -> dict:
    with _lock:
        data = _load()
        fp = fingerprint(path)
        cur = data.get(fp, {"favorite": False, "tags": [], "path": str(path)})
        if favorite is not None:
            cur["favorite"] = favorite
        if tags is not None:
            cur["tags"] = tags
        cur["path"] = str(path)
        data[fp] = cur
        _save(data)
        return cur
