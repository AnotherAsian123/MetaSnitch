"""Environment-driven configuration (Unraid-friendly: all via env vars)."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="METASNITCH_", extra="ignore")

    # Image library roots mounted into the container (read-only on Unraid).
    # NoDecode: accept a plain comma/semicolon-separated string from the env var
    # rather than requiring JSON; the validator below splits it.
    scan_roots: Annotated[list[str], NoDecode] = ["/data"]
    # Appdata volume: cache, logs, settings, uploads, tags.
    config_dir: str = "/config"

    metadata_cache_size: int = 256
    thumb_size: int = 320
    thumb_quality: int = 80

    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    @field_validator("scan_roots", mode="before")
    @classmethod
    def _split_roots(cls, v):
        # Allow comma/semicolon/os-pathsep separated string from a single env var.
        if isinstance(v, str):
            return [p.strip() for p in re.split(r"[;,]", v) if p.strip()]
        return v

    @property
    def config_path(self) -> Path:
        return Path(self.config_dir)

    @property
    def uploads_dir(self) -> Path:
        return self.config_path / "uploads"

    @property
    def thumbs_dir(self) -> Path:
        return self.config_path / "thumbnails"

    @property
    def logs_dir(self) -> Path:
        return self.config_path / "logs"

    @property
    def tags_file(self) -> Path:
        return self.config_path / "tags.json"

    def allowed_roots(self) -> list[Path]:
        """Roots a request is permitted to read from (library mounts + uploads)."""
        roots: list[Path] = []
        for r in self.scan_roots:
            try:
                roots.append(Path(r).resolve())
            except OSError:
                continue
        roots.append(self.uploads_dir.resolve())
        return roots

    def ensure_dirs(self) -> None:
        for d in (self.uploads_dir, self.thumbs_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
