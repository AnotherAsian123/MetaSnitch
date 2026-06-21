"""Dispatch: extract raw containers, then try parsers in priority order."""

from __future__ import annotations

from pathlib import Path
from typing import IO

from PIL import Image

from ..core.config import get_settings
from ..core.logging import log_failure
from ..models import NormalizedMetadata
from ..parsers.a1111 import A1111Parser
from ..parsers.comfyui import ComfyUIParser
from ..parsers.raw import RawParser
from .cache import LRUCache
from .extract import extract

# Order matters: structured generators first, raw fallback last.
_PARSERS = [ComfyUIParser(), A1111Parser()]
_RAW = RawParser()


def parse_source(source: str | IO[bytes] | Image.Image, label: str = "") -> NormalizedMetadata:
    info, size, fmt = extract(source)

    result: NormalizedMetadata | None = None
    for parser in _PARSERS:
        try:
            if parser.detect(info):
                result = parser.parse(info)
                break
        except Exception as exc:  # never let one parser break the request
            log_failure(
                f"Parser '{parser.name}' failed on {label or 'image'}",
                context={"keys": list(info.keys())},
                exc=exc,
            )
    if result is None:
        result = _RAW.parse(info)

    if size:
        result.width, result.height = size
    result.format = fmt
    return result


_md_cache = LRUCache(get_settings().metadata_cache_size)


def parse_path(path: str) -> NormalizedMetadata:
    """Parse a file on disk, with a bounded LRU keyed by path + mtime + size."""
    p = Path(path)
    st = p.stat()
    key = (str(p), st.st_mtime_ns, st.st_size)
    hit = _md_cache.get(key)
    if hit is not None:
        return hit
    result = parse_source(str(p), label=p.name)
    _md_cache.set(key, result)
    return result
