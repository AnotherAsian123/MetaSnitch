"""Shared data models. `NormalizedMetadata` is the consistent shape the UI renders
regardless of which generator produced the image."""

from __future__ import annotations

from pydantic import BaseModel, Field


class NormalizedMetadata(BaseModel):
    source: str = "Unknown"
    # Always-shown, important-first fields (seed, model, sampler, steps, cfg, denoise, size...).
    summary: dict = Field(default_factory=dict)
    prompt: str | None = None
    negative_prompt: str | None = None
    loras: list[dict] = Field(default_factory=list)
    # Collapsible nested sections for the long tail of parameters.
    groups: dict = Field(default_factory=dict)
    # ComfyUI transparency: which custom packs/nodes appeared, and what we couldn't read.
    custom_nodes: list[str] = Field(default_factory=list)
    unresolved_nodes: list[str] = Field(default_factory=list)
    # Full original blobs (collapsed/copyable in the UI; nothing is ever lost).
    raw: dict = Field(default_factory=dict)
    # File-level info.
    width: int | None = None
    height: int | None = None
    format: str | None = None


class DirEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    is_image: bool = False
    size: int = 0
    mtime: float = 0.0


class IndexEntry(BaseModel):
    name: str
    path: str
    size: int
    mtime: float
    width: int | None = None
    height: int | None = None
    source: str | None = None
    model: str | None = None
    sampler: str | None = None
    seed: str | None = None
    prompt: str | None = None
