"""On-demand WebP thumbnails, cached to disk in the appdata volume."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, ImageOps

from ..core.config import get_settings


def _thumb_path(src: Path, size: int) -> Path:
    st = src.stat()
    key = f"{src}|{st.st_mtime_ns}|{st.st_size}|{size}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return get_settings().thumbs_dir / f"{digest}.webp"


def get_thumbnail(src: Path, size: int | None = None) -> Path:
    settings = get_settings()
    size = size or settings.thumb_size
    out = _thumb_path(src, size)
    if out.exists():
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im.thumbnail((size, size))
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        im.save(out, format="WEBP", quality=settings.thumb_quality, method=4)
    return out
