"""Last-resort parser: surface whatever text/EXIF/XMP key-values exist so the UI
never shows a blank panel for an unrecognized generator."""

from __future__ import annotations

from ..models import NormalizedMetadata
from .base import Parser

_NOISE_KEYS = {"icc_profile", "exif", "dpi", "jfif", "jfif_version"}


class RawParser(Parser):
    name = "Raw"

    def detect(self, info: dict[str, str]) -> bool:
        return True

    def parse(self, info: dict[str, str]) -> NormalizedMetadata:
        fields = {
            k: (v if len(v) <= 20000 else v[:20000] + "… (truncated)")
            for k, v in info.items()
            if k.lower() not in _NOISE_KEYS and isinstance(v, str) and v.strip()
        }
        source = "Unknown"
        # A couple of cheap source hints even when we can't fully parse.
        if any("invokeai" in k.lower() or "sd-metadata" in k.lower() for k in info):
            source = "InvokeAI"
        elif "Comment" in info or "Software" in info and "NovelAI" in info.get("Software", ""):
            source = "NovelAI"
        groups = {"Raw metadata": fields} if fields else {}
        return NormalizedMetadata(source=source, groups=groups, raw=dict(info))
