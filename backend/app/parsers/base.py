"""Parser interface. Each generator implements detect()/parse()."""

from __future__ import annotations

from ..models import NormalizedMetadata


class Parser:
    name: str = "base"

    def detect(self, info: dict[str, str]) -> bool:  # pragma: no cover - interface
        raise NotImplementedError

    def parse(self, info: dict[str, str]) -> NormalizedMetadata:  # pragma: no cover
        raise NotImplementedError
