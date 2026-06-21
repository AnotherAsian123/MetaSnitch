"""Directory listing + image enumeration."""

from __future__ import annotations

from pathlib import Path

from ..models import DirEntry
from .extract import IMAGE_EXTENSIONS


def list_dir(path: Path, sort: str = "date") -> list[DirEntry]:
    entries: list[DirEntry] = []
    for child in path.iterdir():
        try:
            st = child.stat()
            is_dir = child.is_dir()
        except OSError:
            continue
        is_img = (not is_dir) and child.suffix.lower() in IMAGE_EXTENSIONS
        if is_dir or is_img:
            entries.append(
                DirEntry(
                    name=child.name,
                    path=str(child),
                    is_dir=is_dir,
                    is_image=is_img,
                    size=st.st_size,
                    mtime=st.st_mtime,
                )
            )
    return sort_entries(entries, sort)


def sort_entries(entries: list[DirEntry], sort: str) -> list[DirEntry]:
    # Folders always first, then the chosen image ordering.
    if sort == "name":
        key = lambda e: e.name.lower()
        reverse = False
    elif sort == "name-desc":
        key = lambda e: e.name.lower()
        reverse = True
    elif sort == "size":
        key = lambda e: e.size
        reverse = True
    elif sort == "date-asc":
        key = lambda e: e.mtime
        reverse = False
    else:  # "date" (default: newest first)
        key = lambda e: e.mtime
        reverse = True
    dirs = sorted([e for e in entries if e.is_dir], key=lambda e: e.name.lower())
    files = sorted([e for e in entries if not e.is_dir], key=key, reverse=reverse)
    return dirs + files


def list_images(path: Path) -> list[Path]:
    out: list[Path] = []
    try:
        for child in path.iterdir():
            if child.is_file() and child.suffix.lower() in IMAGE_EXTENSIONS:
                out.append(child)
    except OSError:
        pass
    return out
