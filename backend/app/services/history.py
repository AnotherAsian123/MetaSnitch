"""Recently-analysed folders, persisted as flat JSON in the appdata volume so the
list survives across sessions."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from ..core.config import get_settings

_lock = threading.Lock()
_MAX = 50


def _file() -> Path:
    return get_settings().config_path / "history.json"


def _load() -> list[dict]:
    f = _file()
    if f.exists():
        try:
            data = json.loads(f.read_text("utf-8"))
            return data if isinstance(data, list) else []
        except (ValueError, OSError):
            return []
    return []


def _save(data: list[dict]) -> None:
    f = _file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=2), "utf-8")


def list_history() -> list[dict]:
    return _load()


def record(path: Path, count: int | None = None) -> dict:
    with _lock:
        key = str(path)
        data = [e for e in _load() if e.get("path") != key]
        entry: dict = {"path": key, "name": path.name or key, "last_opened": time.time()}
        if count is not None:
            entry["count"] = count
        data.insert(0, entry)
        del data[_MAX:]
        _save(data)
        return entry


def remove(path: Path) -> list[dict]:
    with _lock:
        data = [e for e in _load() if e.get("path") != str(path)]
        _save(data)
        return data
