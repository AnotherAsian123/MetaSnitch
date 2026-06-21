"""End-to-end API smoke test against a temp folder of synthesized images."""

import io
import json
import os
import tempfile
from pathlib import Path

from PIL import Image, PngImagePlugin

# Configure roots BEFORE importing the app (settings are cached at import).
_TMP = tempfile.mkdtemp(prefix="metasnitch-test-")
_DATA = Path(_TMP) / "data"
_DATA.mkdir(parents=True, exist_ok=True)
os.environ["METASNITCH_SCAN_ROOTS"] = str(_DATA)
os.environ["METASNITCH_CONFIG_DIR"] = str(Path(_TMP) / "config")


def _make_png(path: Path, **text):
    img = Image.new("RGB", (16, 16), (34, 40, 35))
    meta = PngImagePlugin.PngInfo()
    for k, v in text.items():
        meta.add_text(k, v)
    img.save(path, format="PNG", pnginfo=meta)


A1111 = (
    "a cat on a sofa\nNegative prompt: ugly\n"
    "Steps: 20, Sampler: Euler, CFG scale: 7, Seed: 555, Size: 64x64, Model: dreamshaper"
)
COMFY = json.dumps({
    "3": {"class_type": "KSampler", "inputs": {"seed": 555, "steps": 30, "cfg": 6.0,
          "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
          "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
    "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sdxl.safetensors"}},
    "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 64, "height": 64}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "a dog running", "clip": ["4", 1]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry", "clip": ["4", 1]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}},
})

_make_png(_DATA / "a1111.png", parameters=A1111)
_make_png(_DATA / "comfy.png", prompt=COMFY)
_make_png(_DATA / "mystery.png", Comment="no idea")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_browse_lists_images():
    r = client.get("/api/browse", params={"path": str(_DATA)})
    assert r.status_code == 200
    names = {e["name"] for e in r.json()["entries"]}
    assert {"a1111.png", "comfy.png", "mystery.png"} <= names


def test_metadata_comfy():
    r = client.get("/api/metadata", params={"path": str(_DATA / "comfy.png")})
    assert r.status_code == 200
    md = r.json()
    assert md["source"] == "ComfyUI"
    assert md["summary"]["sampler"] == "dpmpp_2m"
    assert md["prompt"] == "a dog running"


def test_thumb():
    r = client.get("/api/thumb", params={"path": str(_DATA / "a1111.png")})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/webp"


def test_search_by_prompt():
    r = client.get("/api/search", params={"path": str(_DATA), "q": "dog"})
    assert r.status_code == 200
    paths = {Path(e["path"]).name for e in r.json()}
    assert "comfy.png" in paths and "a1111.png" not in paths


def test_seed_cluster():
    # Both a1111.png and comfy.png share seed 555 -> one cluster of 2.
    r = client.get("/api/seeds", params={"path": str(_DATA)})
    assert r.status_code == 200
    clusters = r.json()
    assert any(c["count"] == 2 and c["seed"] == "555" for c in clusters)


def test_parse_upload():
    buf = io.BytesIO()
    img = Image.new("RGB", (8, 8))
    meta = PngImagePlugin.PngInfo()
    meta.add_text("parameters", A1111)
    img.save(buf, format="PNG", pnginfo=meta)
    buf.seek(0)
    r = client.post("/api/parse", files={"file": ("x.png", buf, "image/png")})
    assert r.status_code == 200
    assert r.json()["summary"]["seed"] == "555"


def test_export_csv():
    r = client.get("/api/export", params={"path": str(_DATA), "fmt": "csv"})
    assert r.status_code == 200
    assert "seed" in r.text.splitlines()[0]


def test_path_guard_blocks_outside():
    r = client.get("/api/metadata", params={"path": str(Path(_TMP))})
    assert r.status_code == 400


def test_upload_persists_and_is_browsable():
    import os

    buf = io.BytesIO()
    img = Image.new("RGB", (8, 8))
    meta = PngImagePlugin.PngInfo()
    meta.add_text("parameters", A1111)
    img.save(buf, format="PNG", pnginfo=meta)
    buf.seek(0)
    r = client.post("/api/upload", files={"file": ("persisted.png", buf, "image/png")})
    assert r.status_code == 200
    path = r.json()["path"]

    # The uploads folder is an allowed root and now contains the file.
    updir = os.path.dirname(path)
    b = client.get("/api/browse", params={"path": updir})
    assert b.status_code == 200
    assert os.path.basename(path) in {e["name"] for e in b.json()["entries"]}

    # And its metadata is readable through the normal endpoint.
    m = client.get("/api/metadata", params={"path": path})
    assert m.status_code == 200 and m.json()["summary"]["seed"] == "555"


def test_history_records_and_lists():
    r = client.post("/api/history", json={"path": str(_DATA), "count": 3})
    assert r.status_code == 200
    h = client.get("/api/history")
    assert h.status_code == 200
    assert any(e["path"] == str(_DATA) and e.get("count") == 3 for e in h.json())
    # Removal works.
    d = client.request("DELETE", "/api/history", params={"path": str(_DATA)})
    assert d.status_code == 200
    assert all(e["path"] != str(_DATA) for e in client.get("/api/history").json())


def test_compare():
    paths = ",".join([str(_DATA / "a1111.png"), str(_DATA / "comfy.png")])
    r = client.get("/api/compare", params={"paths": paths})
    assert r.status_code == 200 and len(r.json()) == 2
