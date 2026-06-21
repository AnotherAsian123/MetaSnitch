"""Parser tests against synthesized images (A1111, ComfyUI stock + custom stack)."""

import io
import json

from PIL import Image, PngImagePlugin

from app.services.metadata import parse_source

A1111_TEXT = (
    "masterpiece, 1girl, detailed\n"
    "Negative prompt: bad hands, blurry\n"
    "Steps: 25, Sampler: DPM++ 2M Karras, CFG scale: 7.5, Seed: 1234567890, "
    "Size: 512x768, Model hash: abc123, Model: dreamshaper_8, "
    "Denoising strength: 0.45, Version: v1.7.0"
)

COMFY_STOCK = {
    "3": {"class_type": "KSampler", "inputs": {
        "seed": 42, "steps": 20, "cfg": 8.0, "sampler_name": "euler",
        "scheduler": "normal", "denoise": 1.0, "model": ["4", 0],
        "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
    "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
    "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "a cat", "clip": ["4", 1]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "ugly", "clip": ["4", 1]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}},
}

# Decoupled "custom sampling" stack + an unknown custom node.
COMFY_CUSTOM = {
    "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": 99}},
    "11": {"class_type": "BasicScheduler", "inputs": {"scheduler": "karras", "steps": 30, "denoise": 0.8, "model": ["4", 0]}},
    "12": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "dpmpp_2m"}},
    "13": {"class_type": "CFGGuider", "inputs": {"cfg": 4.5, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0]}},
    "14": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["10", 0], "guider": ["13", 0], "sampler": ["12", 0], "sigmas": ["11", 0], "latent_image": ["5", 0]}},
    "4": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux_dev.safetensors"}},
    "5": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 832, "height": 1216}},
    "6": {"class_type": "SuperCustomTextEncode", "inputs": {"text": "a fox in snow", "clip": ["4", 1]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "lowres", "clip": ["4", 1]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["4", 2]}},
    "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}},
}


def _png_with_text(**text) -> io.BytesIO:
    img = Image.new("RGB", (8, 8), (20, 30, 25))
    meta = PngImagePlugin.PngInfo()
    for k, v in text.items():
        meta.add_text(k, v)
    buf = io.BytesIO()
    img.save(buf, format="PNG", pnginfo=meta)
    buf.seek(0)
    return buf


def test_a1111():
    md = parse_source(_png_with_text(parameters=A1111_TEXT))
    assert md.source == "A1111"
    assert md.summary["seed"] == "1234567890"
    assert md.summary["sampler"] == "DPM++ 2M Karras"
    assert md.summary["steps"] == "25"
    assert md.summary["cfg"] == "7.5"
    assert md.summary["denoise"] == "0.45"
    assert md.summary["model"] == "dreamshaper_8"
    assert md.summary["size"] == "512x768"
    assert md.prompt == "masterpiece, 1girl, detailed"
    assert md.negative_prompt == "bad hands, blurry"


def test_a1111_via_usercomment_string():
    # Simulate JPEG/WebP path where the same string arrives via UserComment.
    from app.parsers.a1111 import A1111Parser
    md = A1111Parser().parse({"UserComment": A1111_TEXT})
    assert md.summary["seed"] == "1234567890"


def test_comfy_stock():
    md = parse_source(_png_with_text(prompt=json.dumps(COMFY_STOCK)))
    assert md.source == "ComfyUI"
    assert md.summary["seed"] == 42
    assert md.summary["steps"] == 20
    assert md.summary["cfg"] == 8.0
    assert md.summary["sampler"] == "euler"
    assert md.summary["scheduler"] == "normal"
    assert md.summary["model"] == "sd_xl_base_1.0.safetensors"
    assert md.summary["size"] == "1024x1024"
    assert md.prompt == "a cat"
    assert md.negative_prompt == "ugly"


def test_comfy_custom_decoupled_stack():
    md = parse_source(_png_with_text(prompt=json.dumps(COMFY_CUSTOM)))
    assert md.source == "ComfyUI"
    assert md.summary["seed"] == 99
    assert md.summary["steps"] == 30
    assert md.summary["cfg"] == 4.5
    assert md.summary["sampler"] == "dpmpp_2m"
    assert md.summary["scheduler"] == "karras"
    assert md.summary["denoise"] == 0.8
    assert md.summary["model"] == "flux_dev.safetensors"
    assert md.summary["size"] == "832x1216"
    # Prompt traced through an UNKNOWN custom encoder node.
    assert md.prompt == "a fox in snow"
    assert md.negative_prompt == "lowres"
    # Custom/unknown node types reported.
    assert "SuperCustomTextEncode" in md.custom_nodes


def test_unknown_falls_back_to_raw():
    md = parse_source(_png_with_text(Comment="some unrecognized blob"))
    assert md.groups  # raw metadata surfaced, never blank
