"""Read raw metadata containers out of an image, regardless of format.

Returns a flat dict of candidate string fields (PNG tEXt/zTXt/iTXt, EXIF
UserComment/ImageDescription, XMP) that the format-specific parsers inspect.
Reads only headers/metadata — never decodes pixels."""

from __future__ import annotations

from typing import IO

from PIL import ExifTags, Image

# Pillow guards against very large text chunks by default; AI workflows are big.
Image.MAX_TEXT_CHUNK = 100 * 1024 * 1024  # 100 MB
Image.MAX_TEXT_MEMORY = 256 * 1024 * 1024

IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif",
    ".avif", ".jfif",
}


def _read_png_text(img: Image.Image) -> dict[str, str]:
    out: dict[str, str] = {}
    text = getattr(img, "text", None)
    if text:
        for k, v in text.items():
            if isinstance(v, str):
                out[k] = v
    for k, v in (img.info or {}).items():
        if isinstance(v, str) and k not in out:
            out[k] = v
    return out


def _decode_user_comment(uc) -> str:
    if isinstance(uc, str):
        return uc
    if isinstance(uc, bytes):
        if uc[:8] == b"UNICODE\x00":
            body = uc[8:]
            for enc in ("utf-16-be", "utf-16-le", "utf-8"):
                try:
                    return body.decode(enc).rstrip("\x00")
                except UnicodeDecodeError:
                    continue
        if uc[:8] in (b"ASCII\x00\x00\x00", b"ASCII\x00\x00\x00"):
            return uc[8:].decode("ascii", "ignore").rstrip("\x00")
        return uc.decode("utf-8", "ignore").rstrip("\x00")
    return str(uc)


def _read_exif_strings(img: Image.Image) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        exif = img.getexif()
    except Exception:
        return out
    if not exif:
        return out

    desc = exif.get(0x010E)  # ImageDescription
    if isinstance(desc, str) and desc.strip():
        out["ImageDescription"] = desc

    # XPComment (Windows) is UTF-16LE bytes.
    xp = exif.get(0x9C9C)
    if isinstance(xp, (bytes, bytearray)):
        try:
            out["XPComment"] = bytes(xp).decode("utf-16-le").rstrip("\x00")
        except UnicodeDecodeError:
            pass

    try:
        exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
    except Exception:
        exif_ifd = {}
    uc = (exif_ifd or {}).get(0x9286)  # UserComment
    if uc:
        decoded = _decode_user_comment(uc)
        if decoded.strip():
            out["UserComment"] = decoded
    return out


def extract(source: str | IO[bytes] | Image.Image) -> tuple[dict[str, str], tuple[int, int] | None, str | None]:
    """Return (candidate string fields, (width, height), format)."""
    if isinstance(source, Image.Image):
        img = source
        close = False
    else:
        img = Image.open(source)
        close = True
    try:
        fmt = img.format
        size = img.size
        info: dict[str, str] = {}
        info.update(_read_png_text(img))
        for k, v in _read_exif_strings(img).items():
            info.setdefault(k, v)
        xmp = (img.info or {}).get("xmp")
        if xmp:
            info["xmp"] = xmp.decode("utf-8", "ignore") if isinstance(xmp, (bytes, bytearray)) else str(xmp)
        return info, size, fmt
    finally:
        if close:
            img.close()
