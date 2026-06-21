"""On-demand WebP thumbnails, cached to disk in the appdata volume.

Uses libvips (pyvips) when available — its `thumbnail` operation does
shrink-on-load (decodes JPEG/WebP at reduced resolution), is multi-threaded and
SIMD-accelerated, and is ~10x faster than Pillow for this. Falls back to a tuned
Pillow path (shrink-on-load via draft()/reducing_gap) when libvips is absent."""

from __future__ import annotations

import hashlib
from pathlib import Path

from ..core.config import get_settings
from ..core.logging import logger

try:  # libvips must be present at runtime (installed in the Docker image)
    import pyvips

    _HAS_VIPS = True
except Exception:  # pragma: no cover - depends on system libvips
    pyvips = None  # type: ignore[assignment]
    _HAS_VIPS = False


def _thumb_path(src: Path, size: int) -> Path:
    st = src.stat()
    key = f"{src}|{st.st_mtime_ns}|{st.st_size}|{size}|v2"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
    return get_settings().thumbs_dir / f"{digest}.webp"


def get_thumbnail(src: Path, size: int | None = None) -> Path:
    settings = get_settings()
    size = size or settings.thumb_size
    out = _thumb_path(src, size)
    if out.exists():
        return out
    out.parent.mkdir(parents=True, exist_ok=True)

    if _HAS_VIPS:
        try:
            _vips_thumb(src, out, size, settings.thumb_quality)
            return out
        except Exception as exc:  # pragma: no cover - fall back on any vips error
            logger.warning("libvips thumbnail failed for %s (%s); using Pillow", src, exc)

    _pillow_thumb(src, out, size, settings.thumb_quality)
    return out


def _vips_thumb(src: Path, out: Path, size: int, quality: int) -> None:
    # Shrink-on-load + high-quality resize, aspect preserved (longest edge = size).
    # auto_rotate honours EXIF orientation; strip drops metadata to save bytes.
    image = pyvips.Image.thumbnail(str(src), size, height=size, size="down")
    image.webpsave(
        str(out),
        Q=quality,
        effort=4,
        smart_subsample=True,
        strip=True,
    )


def _pillow_thumb(src: Path, out: Path, size: int, quality: int) -> None:
    from PIL import Image, ImageOps

    with Image.open(src) as im:
        # thumbnail() uses draft() (JPEG shrink-on-load) + reduce() via reducing_gap,
        # then a high-quality LANCZOS final pass.
        im.thumbnail((size, size), resample=Image.Resampling.LANCZOS, reducing_gap=2.0)
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")
        im.save(out, format="WEBP", quality=quality, method=4)
