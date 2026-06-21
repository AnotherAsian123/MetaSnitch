"""Tiny thread-safe LRU cache (bounded, no bloat)."""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock
from typing import Any, Hashable


class LRUCache:
    def __init__(self, maxsize: int = 256) -> None:
        self.maxsize = max(1, maxsize)
        self._data: "OrderedDict[Hashable, Any]" = OrderedDict()
        self._lock = Lock()

    def get(self, key: Hashable) -> Any | None:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                return self._data[key]
            return None

    def set(self, key: Hashable, value: Any) -> None:
        with self._lock:
            self._data[key] = value
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)
