"""Export a folder's metadata index as CSV or JSON."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from .index import build_index

_CSV_COLUMNS = [
    "name", "path", "source", "model", "sampler", "seed",
    "width", "height", "size", "mtime", "prompt",
]


def export_folder(path: Path, fmt: str) -> tuple[bytes, str, str]:
    entries = build_index(path)
    stem = path.name or "metadata"
    if fmt == "json":
        body = json.dumps([e.model_dump() for e in entries], indent=2).encode("utf-8")
        return body, "application/json", f"{stem}-metadata.json"

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for e in entries:
        writer.writerow(e.model_dump())
    return buf.getvalue().encode("utf-8"), "text/csv", f"{stem}-metadata.csv"
