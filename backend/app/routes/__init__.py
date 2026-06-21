"""All HTTP endpoints. Thin wrappers over the services; every failure is logged
in two variations (CLAUDE.md): detailed to the backend log, friendly to the UI."""

from __future__ import annotations

import io
import re
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from .. import __version__
from ..core.config import get_settings
from ..core.logging import log_failure
from ..models import DirEntry
from ..services import export as export_svc
from ..services import index as index_svc
from ..services import tags as tags_svc
from ..services.extract import IMAGE_EXTENSIONS
from ..services.metadata import parse_path, parse_source
from ..services.pathguard import PathError, existing_roots, safe_path
from ..services.scan import list_dir
from ..services.thumbnails import get_thumbnail

router = APIRouter()


def _guard(raw: str, *, must_exist: bool = True) -> Path:
    try:
        return safe_path(raw, must_exist=must_exist)
    except PathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}


@router.get("/roots")
def roots() -> list[DirEntry]:
    out: list[DirEntry] = []
    for r in existing_roots():
        try:
            st = r.stat()
        except OSError:
            continue
        out.append(DirEntry(name=str(r), path=str(r), is_dir=True, mtime=st.st_mtime))
    return out


@router.get("/browse")
def browse(path: str = Query(default=""), sort: str = Query(default="date")) -> dict:
    if not path:
        return {"path": "", "parent": None, "entries": [r.model_dump() for r in roots()]}
    p = _guard(path)
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="Not a folder")
    parent = str(p.parent) if any(
        str(p) != str(r) for r in existing_roots()
    ) and p != p.parent else None
    return {
        "path": str(p),
        "parent": parent,
        "entries": [e.model_dump() for e in list_dir(p, sort)],
    }


@router.get("/thumb")
def thumb(path: str = Query(...), size: int | None = Query(default=None)) -> FileResponse:
    p = _guard(path)
    try:
        thumb_file = get_thumbnail(p, size)
    except Exception as exc:
        summary = log_failure(f"Couldn't make a thumbnail for {p.name}", context={"path": str(p)}, exc=exc)
        raise HTTPException(status_code=422, detail=summary) from exc
    return FileResponse(thumb_file, media_type="image/webp")


@router.get("/image")
def image(path: str = Query(...)) -> FileResponse:
    p = _guard(path)
    if p.suffix.lower() not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Not an image")
    return FileResponse(p)


@router.get("/metadata")
def metadata(path: str = Query(...)) -> JSONResponse:
    p = _guard(path)
    try:
        md = parse_path(str(p))
    except Exception as exc:
        summary = log_failure(f"Couldn't read metadata for {p.name}", context={"path": str(p)}, exc=exc)
        raise HTTPException(status_code=422, detail=summary) from exc
    return JSONResponse(md.model_dump())


@router.post("/parse")
async def parse(file: UploadFile = File(...)) -> JSONResponse:
    data = await file.read()
    try:
        md = parse_source(io.BytesIO(data), label=file.filename or "upload")
    except Exception as exc:
        summary = log_failure(
            f"Couldn't parse {file.filename or 'the dropped image'}",
            context={"filename": file.filename, "bytes": len(data)},
            exc=exc,
        )
        raise HTTPException(status_code=422, detail=summary) from exc
    return JSONResponse(md.model_dump())


_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


@router.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    settings = get_settings()
    settings.ensure_dirs()
    name = _SAFE_NAME.sub("_", Path(file.filename or "upload").name) or "upload"
    if Path(name).suffix.lower() not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    dest = settings.uploads_dir / name
    counter = 1
    while dest.exists():
        dest = settings.uploads_dir / f"{Path(name).stem}_{counter}{Path(name).suffix}"
        counter += 1
    try:
        dest.write_bytes(await file.read())
    except Exception as exc:
        summary = log_failure(f"Couldn't save {name}", context={"dest": str(dest)}, exc=exc)
        raise HTTPException(status_code=500, detail=summary) from exc
    return {"path": str(dest), "name": dest.name}


@router.get("/search")
def search(
    path: str = Query(...),
    q: str | None = None,
    model: str | None = None,
    sampler: str | None = None,
    seed: str | None = None,
    sort: str = "date",
) -> list[dict]:
    p = _guard(path)
    entries = index_svc.search(p, q=q, model=model, sampler=sampler, seed=seed, sort=sort)
    return [e.model_dump() for e in entries]


@router.get("/seeds")
def seeds(path: str = Query(...), proximity: int = Query(default=0)) -> list[dict]:
    p = _guard(path)
    return index_svc.seed_clusters(p, proximity=proximity)


@router.get("/compare")
def compare(paths: str = Query(...)) -> list[dict]:
    out: list[dict] = []
    for raw in [s for s in paths.split(",") if s.strip()]:
        p = _guard(raw)
        try:
            out.append(parse_path(str(p)).model_dump())
        except Exception as exc:
            log_failure(f"Compare: couldn't read {p.name}", context={"path": str(p)}, exc=exc)
    return out


@router.get("/export")
def export(path: str = Query(...), fmt: str = Query(default="csv")) -> Response:
    p = _guard(path)
    fmt = "json" if fmt.lower() == "json" else "csv"
    body, media, filename = export_svc.export_folder(p, fmt)
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class TagBody(BaseModel):
    path: str
    favorite: bool | None = None
    tags: list[str] | None = None


@router.get("/tags")
def get_tags(path: str = Query(...)) -> dict:
    p = _guard(path)
    return tags_svc.get_tags(p)


@router.post("/tags")
def set_tags(body: TagBody) -> dict:
    p = _guard(body.path)
    return tags_svc.set_tags(p, favorite=body.favorite, tags=body.tags)
