"""Confine all filesystem access to the configured allowed roots."""

from __future__ import annotations

from pathlib import Path

from ..core.config import get_settings


class PathError(Exception):
    pass


def safe_path(raw: str, *, must_exist: bool = True) -> Path:
    if not raw:
        raise PathError("No path provided")
    try:
        p = Path(raw).resolve()
    except OSError as exc:
        raise PathError(f"Invalid path: {raw}") from exc

    for root in get_settings().allowed_roots():
        try:
            p.relative_to(root)
            break
        except ValueError:
            continue
    else:
        raise PathError("Path is outside the allowed folders")

    if must_exist and not p.exists():
        raise PathError("Path does not exist")
    return p


def existing_roots() -> list[Path]:
    return [r for r in get_settings().allowed_roots() if r.exists()]
