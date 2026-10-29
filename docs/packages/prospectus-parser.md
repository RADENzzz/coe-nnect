# Prospectus parser service

`packages/prospectus-parser` is a Python FastAPI service that extracts selectable text from prospectus PDFs. A user or editor identifies table, row, and column regions; the service reads text from those regions. Image-only pages (scans, screenshots pasted into Word) have no text layer; for those the service offers an **opt-in OCR fallback** (see [OCR](#ocr)).

The backend integration URL is configured with `PROSPECTUS_PARSER_URL`; the backend environment template defaults it to `http://localhost:8001`.

## Endpoints

- `GET /health` — reports service health.
- `POST /info` — accepts a base64-encoded PDF and returns its page count and page dimensions in PDF points.
- `POST /extract` — accepts a base64-encoded PDF and a non-empty list of regions, then returns extracted subjects grouped by `table_id`. Pass `ocr: true` to enable the OCR fallback.

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

OCR is optional: it needs the Tesseract binary on `PATH` (on Windows, install the UB Mannheim build; on Debian/Ubuntu, `apt install tesseract-ocr`). Without it the service runs normally and `/extract` returns `503` only when `ocr: true` is requested.

## OCR

`POST /extract` accepts `ocr: true`. For each page that a region touches, the service:

1. Renders the page at `ocr_dpi` (default 300).
2. Converts to grayscale, **inverts dark pages**, and normalises contrast — white-on-black text is unreadable to Tesseract otherwise.
3. Runs Tesseract and bins the resulting words back into the caller's row/column rectangles by their centres.

The text layer always wins: OCR only fills cells that come back blank. That keeps normal PDFs fast and lossless, and makes mixed documents (real text + one pasted image) work. Requests are handled the same as before; `warnings` in the backend response tell the user when nothing could be read even with OCR.

## Implementation

The service uses `pypdfium2` to inspect pages and extract text, reuses page text while processing regions on the same page, and closes temporary PDF resources after each request. See the [parser README](../../packages/prospectus-parser/README.md) for a short entry point.
