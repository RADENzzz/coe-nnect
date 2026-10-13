# Prospectus parser service

`packages/prospectus-parser` is a Python FastAPI service that extracts selectable text from prospectus PDFs. A user or editor identifies table, row, and column regions; the service reads text from those regions. It is **not an OCR service** and cannot recognize text from image-only pages.

The backend integration URL is configured with `PROSPECTUS_PARSER_URL`; the backend environment template defaults it to `http://localhost:8001`.

## Endpoints

- `GET /health` — reports service health.
- `POST /info` — accepts a base64-encoded PDF and returns its page count and page dimensions in PDF points.
- `POST /extract` — accepts a base64-encoded PDF and a non-empty list of regions, then returns extracted subjects grouped by `table_id`.

Each region uses a zero-based `page_index`, table bounds, row bounds, and six column roles: `code`, `title`, `prereq`, `lec`, `lab`, and `total`. Coordinates are in PDF points with the origin at the bottom-left. Bounds must have positive width and height. The request models in `app/` are authoritative for the full schema.

FastAPI's interactive schema is available at `/docs` while the service is running.

## Run locally

From the repository root in PowerShell:

```powershell
Set-Location packages\prospectus-parser
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Check `http://localhost:8001/health`. Configuration defaults are defined in `app/config.py`.

## Implementation

The service uses `pypdfium2` to inspect pages and extract text, reuses page text while processing regions on the same page, and closes temporary PDF resources after each request. See the [parser README](../../packages/prospectus-parser/README.md) for a short entry point.
