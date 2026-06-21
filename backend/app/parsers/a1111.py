"""A1111 / Forge parser.

Format: a single flat string (PNG `parameters` chunk, or EXIF UserComment /
ImageDescription for JPEG/WebP):

    <positive prompt, possibly multi-line>
    Negative prompt: <negative, possibly multi-line>
    Steps: 20, Sampler: Euler a, CFG scale: 7, Seed: 123, Size: 512x512, Model: foo, ...
"""

from __future__ import annotations

import re

from ..models import NormalizedMetadata
from .base import Parser

# key: value pairs on the settings line; quoted values may contain commas.
_RE_PARAM = re.compile(r'\s*([\w \-/]+):\s*("(?:\\.|[^\\"])*"|[^,]*)(?:,|$)')

# Fields promoted to the always-visible summary, mapped to our canonical keys.
_SUMMARY_MAP = {
    "Model": "model",
    "Seed": "seed",
    "Sampler": "sampler",
    "Schedule type": "scheduler",
    "Steps": "steps",
    "CFG scale": "cfg",
    "Denoising strength": "denoise",
    "Size": "size",
}


def _looks_like_params_line(line: str) -> bool:
    return len(_RE_PARAM.findall(line)) >= 3


def parse_parameters(text: str) -> tuple[str, str, dict[str, str]]:
    """Split an A1111 parameters string into (prompt, negative, settings)."""
    text = text.strip()
    if not text:
        return "", "", {}

    lines = text.split("\n")
    last = lines[-1].strip()
    if _looks_like_params_line(last):
        body_lines = lines[:-1]
        settings_line = last
    else:
        body_lines = lines
        settings_line = ""

    prompt_parts: list[str] = []
    negative_parts: list[str] = []
    in_negative = False
    for raw in body_lines:
        line = raw.rstrip()
        stripped = line.strip()
        if stripped.startswith("Negative prompt:"):
            in_negative = True
            line = stripped[len("Negative prompt:"):].strip()
        (negative_parts if in_negative else prompt_parts).append(line)

    settings: dict[str, str] = {}
    for key, value in _RE_PARAM.findall(settings_line):
        key = key.strip()
        value = value.strip()
        if value.startswith('"') and value.endswith('"') and len(value) >= 2:
            value = value[1:-1]
        if key:
            settings[key] = value

    return "\n".join(prompt_parts).strip(), "\n".join(negative_parts).strip(), settings


class A1111Parser(Parser):
    name = "A1111"

    _CANDIDATE_KEYS = ("parameters", "UserComment", "ImageDescription", "XPComment")

    def _raw_text(self, info: dict[str, str]) -> str | None:
        for key in self._CANDIDATE_KEYS:
            value = info.get(key)
            if value and ("Steps:" in value or "Negative prompt:" in value):
                return value
        # `parameters` is authoritative even without the markers above.
        if info.get("parameters"):
            return info["parameters"]
        return None

    def detect(self, info: dict[str, str]) -> bool:
        return self._raw_text(info) is not None

    def parse(self, info: dict[str, str]) -> NormalizedMetadata:
        text = self._raw_text(info) or ""
        prompt, negative, settings = parse_parameters(text)

        summary: dict = {}
        for src, dst in _SUMMARY_MAP.items():
            if src in settings:
                summary[dst] = settings[src]

        # Forge stamps a "Version: f..." (e.g. "f2.0..."); otherwise treat as A1111.
        version = settings.get("Version", "")
        source = "Forge" if version.lower().startswith("f") else "A1111"

        loras = [
            {"name": m.group(1), "weight": m.group(2)}
            for m in re.finditer(r"<lora:([^:>]+):([\d.]+)>", prompt)
        ]

        # Everything not already promoted goes into a collapsible group.
        extra = {k: v for k, v in settings.items() if k not in _SUMMARY_MAP}
        groups = {"All parameters": extra} if extra else {}

        return NormalizedMetadata(
            source=source,
            summary=summary,
            prompt=prompt or None,
            negative_prompt=negative or None,
            loras=loras,
            groups=groups,
            raw={"parameters": text},
        )
