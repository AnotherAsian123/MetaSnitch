"""Dual-variation logging (CLAUDE.md mandate).

Every failure produces:
  1. a short, friendly *summary* string returned to the caller (-> frontend toast)
  2. a *maximally detailed* backend record (traceback, context) in CONFIG_DIR/logs/
"""

from __future__ import annotations

import logging
import sys
import traceback
from logging.handlers import RotatingFileHandler

from .config import get_settings

logger = logging.getLogger("metasnitch")
_failed = logging.getLogger("metasnitch.failed")


def setup_logging() -> None:
    settings = get_settings()
    settings.ensure_dirs()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    fmt = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)

    if not logger.handlers:
        logger.setLevel(level)
        logger.addHandler(console)
        main_file = RotatingFileHandler(
            settings.logs_dir / "metasnitch.log",
            maxBytes=5_000_000,
            backupCount=3,
            encoding="utf-8",
        )
        main_file.setFormatter(fmt)
        logger.addHandler(main_file)

    if not _failed.handlers:
        _failed.setLevel(logging.INFO)
        _failed.propagate = False
        failed_file = RotatingFileHandler(
            settings.logs_dir / "failed_parses.log",
            maxBytes=5_000_000,
            backupCount=3,
            encoding="utf-8",
        )
        failed_file.setFormatter(fmt)
        _failed.addHandler(failed_file)
        _failed.addHandler(console)


def log_failure(
    summary: str,
    *,
    context: dict | None = None,
    exc: BaseException | None = None,
) -> str:
    """Write the detailed backend record; return the friendly frontend summary."""
    detail = summary
    if context:
        detail += " | context=" + repr(context)
    if exc is not None:
        detail += "\n" + "".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__)
        )
    _failed.error(detail)
    return f"{summary} — see the log file for full details."
