# Prospectus parser service

`packages/prospectus-parser` is a Python FastAPI service for extracting selectable text from user-defined regions of prospectus PDFs. The user/editor supplies table, row, and column coordinates; the service extracts text from those cells. It is not an OCR service.

The frontend/backend integration URL is configured on the backend as `PROSPECTUS_PARSER_URL` (default `http://localhost:8001` in the backend template).

## API

- `GET /health` — service name, version, and status.
- `POST /info` — accepts `{ "pdf_base64": "..." }`; returns the page count and each page's dimensions in PDF points.
- `POST /extract` — accepts a base64 PDF and a non-empty list of regions; returns extracted subjects grouped by `table_id`.

An extraction region includes a zero-based `page_index`, table bounds, six required column roles (`code`, `title`, `prereq`, `lec`, `lab`, `total`), and row bounds. Coordinates are PDF points with the origin at the bottom-left. `x_end_pt` must be greater than `x_start_pt`; each row's `y_top_pt` must be greater than `y_bottom_pt`.

Interactive API schemas are available from FastAPI at `/docs` when running locally.

## Run locally

From the repository root:

```powershell
Set-Location packages\prospectus-parser
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Check the service at `http://localhost:8001/health`. Settings such as the port and log level can be supplied through environment variables; defaults are defined in `app/config.py`.

## Implementation notes

The service uses `pypdfium2` to inspect PDF pages and extract text. It caches text pages while processing regions on the same page and closes temporary PDF resources after each request. Source code and request models live in `app/`.
