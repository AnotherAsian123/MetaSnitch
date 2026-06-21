"""FastAPI entrypoint. Serves the API under /api and the built SPA at /."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .core.config import get_settings
from .core.logging import logger, setup_logging
from .routes import router

STATIC_DIR = Path(__file__).resolve().parent / "static"


def create_app() -> FastAPI:
    setup_logging()
    settings = get_settings()
    settings.ensure_dirs()

    app = FastAPI(title="MetaSnitch", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix="/api")

    if STATIC_DIR.exists():
        assets = STATIC_DIR / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str) -> FileResponse:
            target = STATIC_DIR / full_path
            if full_path and target.is_file():
                return FileResponse(target)
            return FileResponse(STATIC_DIR / "index.html")

    logger.info("MetaSnitch %s started; scan_roots=%s", app.version, settings.scan_roots)
    return app


app = create_app()
