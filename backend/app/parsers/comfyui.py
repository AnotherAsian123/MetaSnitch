"""ComfyUI parser — designed for custom nodes and arbitrary workflows (plan §5.1).

Strategy (type-agnostic, degrades gracefully):
  * Prefer the API `prompt` graph (resolved values) over the UI `workflow`.
  * Find the output sink(s) and walk upstream through ANY node type.
  * Extract fields by widget *name* (seed/steps/cfg/...), not node *type*, so
    unknown custom samplers and the decoupled RandomNoise/BasicScheduler/
    KSamplerSelect/CFGGuider stack still resolve.
  * Report detected custom node packs + unresolved nodes; always keep the raw graph.
"""

from __future__ import annotations

import json

from ..models import NormalizedMetadata
from .base import Parser

# Candidate input/widget names per canonical summary field (first literal wins,
# searched from the sink upstream so the node nearest output takes precedence).
_FIELD_NAMES = {
    "seed": ["seed", "noise_seed"],
    "steps": ["steps"],
    "cfg": ["cfg", "guidance", "cfg_scale"],
    "sampler": ["sampler_name"],
    "scheduler": ["scheduler"],
    "denoise": ["denoise", "denoising_strength"],
}
_MODEL_NAMES = ["ckpt_name", "unet_name", "model_name", "base_ckpt_name", "model_path"]
_VAE_NAMES = ["vae_name"]

_SINK_HINTS = ("saveimage", "previewimage", "imagesave", "videocombine")

# A non-exhaustive set of stock class types; anything outside it is reported as
# a custom node. (Only affects the transparency report, never the parsing.)
_STOCK = {
    "KSampler", "KSamplerAdvanced", "CheckpointLoaderSimple", "CheckpointLoader",
    "CLIPTextEncode", "CLIPTextEncodeSDXL", "EmptyLatentImage", "EmptySD3LatentImage",
    "VAEDecode", "VAEEncode", "VAELoader", "SaveImage", "PreviewImage", "LoraLoader",
    "LoraLoaderModelOnly", "ControlNetApply", "ControlNetLoader", "UNETLoader",
    "DualCLIPLoader", "CLIPLoader", "SamplerCustom", "SamplerCustomAdvanced",
    "RandomNoise", "BasicScheduler", "KSamplerSelect", "CFGGuider", "BasicGuider",
    "ConditioningCombine", "ConditioningConcat", "ConditioningZeroOut",
    "LatentUpscale", "ImageScale",
    "ModelSamplingFlux", "FluxGuidance", "PrimitiveNode", "Note", "Reroute",
}


def _is_link(v) -> bool:
    return (
        isinstance(v, list)
        and len(v) == 2
        and isinstance(v[0], (str, int))
        and isinstance(v[1], int)
    )


class ComfyUIParser(Parser):
    name = "ComfyUI"

    def _load_graph(self, info: dict[str, str]):
        """Return ('api', nodes) | ('ui', data) | None."""
        for key in ("prompt", "workflow"):
            raw = info.get(key)
            if not raw:
                continue
            try:
                data = json.loads(raw) if isinstance(raw, str) else raw
            except (ValueError, TypeError):
                continue
            if isinstance(data, dict) and any(
                isinstance(v, dict) and "class_type" in v for v in data.values()
            ):
                return ("api", data)
            if isinstance(data, dict) and "nodes" in data:
                return ("ui", data)
        return None

    def detect(self, info: dict[str, str]) -> bool:
        return self._load_graph(info) is not None

    def parse(self, info: dict[str, str]) -> NormalizedMetadata:
        graph = self._load_graph(info)
        raw_blobs: dict = {}
        if "prompt" in info:
            raw_blobs["prompt"] = _maybe_json(info["prompt"])
        if "workflow" in info:
            raw_blobs["workflow"] = _maybe_json(info["workflow"])

        if graph is None:  # pragma: no cover - detect() guards this
            return NormalizedMetadata(source="ComfyUI", raw=raw_blobs)

        kind, data = graph
        if kind == "api":
            md = self._parse_api(data)
        else:
            md = self._parse_ui(data)
        md.raw = raw_blobs
        return md

    # ------------------------------------------------------------------ API graph
    def _parse_api(self, nodes: dict) -> NormalizedMetadata:
        def node(i):
            return nodes.get(str(i)) or nodes.get(i)

        def inputs(n):
            return (n or {}).get("inputs", {}) or {}

        def upstream(start_ids: list) -> list[str]:
            """BFS over link inputs from start nodes; returns ids in distance order."""
            order: list[str] = []
            seen = set()
            queue = [str(i) for i in start_ids]
            seen.update(queue)
            while queue:
                cur = queue.pop(0)
                n = node(cur)
                if not n:
                    continue
                order.append(cur)
                for v in inputs(n).values():
                    if _is_link(v):
                        t = str(v[0])
                        if t not in seen:
                            seen.add(t)
                            queue.append(t)
            return order

        # 1. Find sinks (output nodes); fall back to all nodes.
        sinks = [
            i for i, n in nodes.items()
            if isinstance(n, dict)
            and any(h in _class(n).lower().replace("_", "").replace(" ", "") for h in _SINK_HINTS)
        ]
        if not sinks:
            sinks = list(nodes.keys())

        # 2. Identify the main sampler nearest the sink.
        def has_sampler(n) -> bool:
            ks = set(inputs(n).keys())
            return (
                "sampler_name" in ks
                or "noise_seed" in ks
                or ("steps" in ks and ("cfg" in ks or "denoise" in ks))
                or "sampler" in ks  # SamplerCustom takes a `sampler` input
            )

        order_from_sinks = upstream(sinks)
        sampler_id = next((i for i in order_from_sinks if has_sampler(node(i))), None)

        scope = upstream([sampler_id] if sampler_id else sinks)

        def first_literal(names: list[str]):
            for i in scope:
                ins = inputs(node(i))
                for name in names:
                    if name in ins and not _is_link(ins[name]):
                        return ins[name]
            return None

        summary: dict = {}
        for field, names in _FIELD_NAMES.items():
            val = first_literal(names)
            if val is not None:
                summary[field] = val

        model = first_literal(_MODEL_NAMES)
        if model is not None:
            summary["model"] = model
        vae = first_literal(_VAE_NAMES)

        width = first_literal(["width"])
        height = first_literal(["height"])
        if width and height:
            summary["size"] = f"{width}x{height}"

        prompt, negative = self._prompts(nodes, inputs, node, sampler_id, scope)
        loras = self._loras(nodes)

        class_types = sorted(
            {_class(n) for n in nodes.values() if isinstance(n, dict)}
        )
        custom = [c for c in class_types if c not in _STOCK]

        # Per-instance settings for each custom node (literal widget values only;
        # link inputs are connections, not settings).
        custom_details: list[dict] = []
        for nid, n in nodes.items():
            if not isinstance(n, dict):
                continue
            ct = _class(n)
            if ct in _STOCK:
                continue
            settings = {k: v for k, v in inputs(n).items() if not _is_link(v)}
            custom_details.append({"id": str(nid), "type": ct, "settings": settings})
        custom_details.sort(key=lambda d: (d["type"], d["id"]))

        groups: dict = {}
        if vae:
            groups.setdefault("Model", {})["vae"] = vae
        if sampler_id is not None:
            literal_inputs = {
                k: v for k, v in inputs(node(sampler_id)).items() if not _is_link(v)
            }
            if literal_inputs:
                groups["Sampler node"] = literal_inputs

        return NormalizedMetadata(
            source="ComfyUI",
            summary=summary,
            prompt=prompt,
            negative_prompt=negative,
            loras=loras,
            groups=groups,
            custom_nodes=custom,
            custom_node_details=custom_details,
        )

    def _prompts(self, nodes, inputs, node, sampler_id, scope):
        def resolve(start):
            """BFS upstream from a conditioning input.

            Returns (text, encoder_node_id, zeroed). `zeroed` is True when the
            chain passes through a ConditioningZeroOut — common for Flux-style
            negatives, where the negative is the positive conditioning zeroed out,
            so it carries no real negative text and must NOT echo the positive.
            """
            queue = [str(start)]
            seen = set()
            while queue:
                cur = queue.pop(0)
                if cur in seen:
                    continue
                seen.add(cur)
                n = node(cur)
                if not n:
                    continue
                ct = _class(n).lower().replace("_", "")
                if "zeroout" in ct or "conditioningzero" in ct:
                    return (None, None, True)
                ins = inputs(n)
                for key in ("text", "text_g", "text_l", "prompt", "wildcard_text"):
                    if key in ins and isinstance(ins[key], str):
                        return (ins[key], cur, False)
                for v in ins.values():
                    if _is_link(v):
                        queue.append(str(v[0]))
            return (None, None, False)

        pos_text = pos_id = None
        neg_text = neg_id = None

        def set_neg(start):
            nonlocal neg_text, neg_id
            text, nid, zeroed = resolve(start)
            neg_text, neg_id = (None, None) if zeroed else (text, nid)

        if sampler_id is not None:
            ins = inputs(node(sampler_id))
            if _is_link(ins.get("positive")):
                pos_text, pos_id, _ = resolve(ins["positive"][0])
            if _is_link(ins.get("negative")):
                set_neg(ins["negative"][0])
            if pos_text is None and _is_link(ins.get("guider")):
                gins = inputs(node(ins["guider"][0]))
                for key in ("positive", "conditioning"):
                    if pos_text is None and _is_link(gins.get(key)):
                        pos_text, pos_id, _ = resolve(gins[key][0])
                if _is_link(gins.get("negative")):
                    set_neg(gins["negative"][0])

        # If the negative resolves to the very same encoder as the positive, it is
        # not a distinct negative — don't report the positive prompt as negative.
        if neg_id is not None and neg_id == pos_id:
            neg_text = None

        if pos_text is None:
            for i in scope:
                n = node(i)
                if "cliptextencode" in _class(n).lower():
                    ins = inputs(n)
                    if isinstance(ins.get("text"), str):
                        pos_text = ins["text"]
                        break
        return pos_text, neg_text

    def _loras(self, nodes) -> list[dict]:
        out: list[dict] = []
        for n in nodes.values():
            if not isinstance(n, dict):
                continue
            ins = n.get("inputs", {}) or {}
            if isinstance(ins.get("lora_name"), str):
                out.append(
                    {
                        "name": ins["lora_name"],
                        "strength_model": ins.get("strength_model"),
                        "strength_clip": ins.get("strength_clip"),
                    }
                )
            # rgthree Power Lora Loader: inputs like {"lora_1": {"lora": "...", ...}}
            for v in ins.values():
                if isinstance(v, dict) and isinstance(v.get("lora"), str):
                    out.append({"name": v["lora"], "strength": v.get("strength")})
        return out

    # ------------------------------------------------------------------- UI graph
    def _parse_ui(self, data: dict) -> NormalizedMetadata:
        """Best-effort when only the UI `workflow` is present (no API `prompt`)."""
        nodes = data.get("nodes", [])
        class_types = sorted({n.get("type", "?") for n in nodes if isinstance(n, dict)})
        custom = [c for c in class_types if c not in _STOCK]
        custom_details = [
            {
                "id": str(n.get("id")),
                "type": n.get("type", "?"),
                "settings": {"widgets_values": n.get("widgets_values")}
                if n.get("widgets_values")
                else {},
            }
            for n in nodes
            if isinstance(n, dict) and n.get("type", "?") not in _STOCK
        ]
        custom_details.sort(key=lambda d: (d["type"], d["id"]))
        prompt = None
        for n in nodes:
            if isinstance(n, dict) and "cliptextencode" in str(n.get("type", "")).lower():
                wv = n.get("widgets_values") or []
                if wv and isinstance(wv[0], str):
                    prompt = wv[0]
                    break
        return NormalizedMetadata(
            source="ComfyUI",
            summary={},
            prompt=prompt,
            custom_nodes=custom,
            custom_node_details=custom_details,
            unresolved_nodes=[
                f"{n.get('type', '?')}#{n.get('id')}" for n in nodes if isinstance(n, dict)
            ][:200],
        )


def _class(n) -> str:
    return str((n or {}).get("class_type") or (n or {}).get("type") or "")


def _maybe_json(raw):
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        return raw
