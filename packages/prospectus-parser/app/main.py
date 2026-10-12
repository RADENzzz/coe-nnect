"""FastAPI entrypoint for the prospectus parser service."""
from __future__ import annotations

import base64
import logging
import os
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import settings
from .models import (
    ExtractRequest,
    ExtractResponse,
    ExtractedRegion,
    HealthResponse,
    InfoRequest,
    InfoResponse,
    PageSize,
)
from .pdf_renderer import PdfDocument
from .text_extractor import extract_region

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(settings.service_name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "%s v%s ready — port=%s max_upload=%sMB",
        settings.service_name,
        __version__,
        settings.port,
        settings.max_upload_bytes // (1024 * 1024),
    )
    yield
    log.info("%s shutting down", settings.service_name)


app = FastAPI(
    title="CoE-NNECT Prospectus Parser",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def _decode_pdf_to_tempfile(pdf_base64: str) -> str:
    """
    Decode a base64 PDF payload to a temp file on the parser's own
    filesystem. Caller is responsible for deleting the file.
    """
    try:
        pdf_bytes = base64.b64decode(pdf_base64, validate=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty PDF payload")
    fd, tmp_path = tempfile.mkstemp(suffix=".pdf", prefix="coennect-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(pdf_bytes)
    except Exception:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise
    return tmp_path


def _safe_unlink(path: str) -> None:
    try:
        os.unlink(path)
    except Exception:
        pass


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        version=__version__,
    )


@app.post("/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest) -> ExtractResponse:
    """
    Extract text for every (region, row, column) cell.

    The caller sends the PDF as base64. We decode it to a temp file,
    run extraction, and clean up.
    """
    pdf_path = _decode_pdf_to_tempfile(req.pdf_base64)

    try:
        doc = PdfDocument(pdf_path)
    except Exception as e:
        _safe_unlink(pdf_path)
        log.exception("Failed to open PDF")
        raise HTTPException(status_code=400, detail=f"Cannot open PDF: {e}")

    try:
        textpage_cache: dict[int, object] = {}
        page_refs: list = []
        results: list[ExtractedRegion] = []

        for region in req.regions:
            if region.page_index >= doc.page_count:
                log.warning(
                    "region table_id=%s page_index=%s out of range (%s pages)",
                    region.table_id,
                    region.page_index,
                    doc.page_count,
                )
                results.append(
                    ExtractedRegion(table_id=region.table_id, subjects=[])
                )
                continue

            if region.page_index not in textpage_cache:
                textpage, page = doc.textpage(region.page_index)
                textpage_cache[region.page_index] = textpage
                page_refs.append(page)

            textpage = textpage_cache[region.page_index]
            subjects = extract_region(textpage, region)
            results.append(
                ExtractedRegion(table_id=region.table_id, subjects=subjects)
            )

        return ExtractResponse(regions=results)

    finally:
        for textpage in textpage_cache.values():
            try:
                textpage.close()
            except Exception:
                pass
        for page in page_refs:
            try:
                page.close()
            except Exception:
                pass
        doc.close()
        _safe_unlink(pdf_path)


@app.post("/info", response_model=InfoResponse)
def info(req: InfoRequest) -> InfoResponse:
    """Return page count + per-page dimensions for a PDF."""
    pdf_path = _decode_pdf_to_tempfile(req.pdf_base64)

    try:
        doc = PdfDocument(pdf_path)
    except Exception as e:
        _safe_unlink(pdf_path)
        log.exception("Failed to open PDF for /info")
        raise HTTPException(status_code=400, detail=f"Cannot open PDF: {e}")

    try:
        sizes = doc.all_page_sizes_pt()
        return InfoResponse(
            page_count=doc.page_count,
            page_sizes_pt=[
                PageSize(page_index=i, width_pt=w, height_pt=h)
                for i, (w, h) in enumerate(sizes)
            ],
        )
    finally:
        doc.close()
        _safe_unlink(pdf_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True,
    )