# Prospectus parser service

`packages/prospectus-parser` is a standalone Python FastAPI service that extracts selectable text from prospectus PDFs. The editor draws table, row, and column regions; the service reads text from those regions and returns one subject record per row. Image-only pages (scans, screenshots pasted into Word) have no text layer; for those the service offers an **opt-in OCR fallback** (see [OCR](#ocr)).

The backend integration URL is configured with `PROSPECTUS_PARSER_URL`; the backend environment template defaults it to `http://localhost:8001`, and Railway injects the private service URL. The browser never calls this service directly.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Returns `{ "status": "ok", "service": "prospectus-parser", "version": "..." }`. Used by Railway and the backend warm-up check. |
| `POST` | `/info` | Accepts a base64-encoded PDF and returns `page_count` plus per-page dimensions in PDF points. |
| `POST` | `/detect` | Scans text pages for course-table headers and returns editable table proposals. |
| `POST` | `/extract` | Accepts a base64-encoded PDF and a non-empty list of regions, then returns extracted subjects grouped by `table_id`. Pass `ocr: true` to enable the OCR fallback. |

FastAPI's interactive schema is available at `/docs` while the service is running.

### `/info`

Request:

```json
{ "pdf_base64": "<base64>" }
```

Response:

```json
{
  "page_count": 12,
  "page_sizes_pt": [
    { "page_index": 0, "width_pt": 612, "height_pt": 792 }
  ]
}
```

### `/detect`

Request:

```json
{
  "pdf_base64": "<base64>",
  "page_indices": [0, 1, 2],
  "max_tables": 30
}
```

- `page_indices` is optional; omitting it scans every page.
- At most the first **40** requested pages are scanned. If more are requested, the response includes a warning and the remaining pages are skipped.
- `max_tables` defaults to **30** and must be between **1** and **100**.
- Out-of-range page indices are ignored.

Each proposal contains the page index, an optional inferred year level and semester, a confidence score from 0 to 1, a label, header text, detection signals, the table rectangle in PDF points, six column slices, and one row band per text line. Proposals are conservative: a table is only returned when a header with known column labels is followed by course-code-like rows. Anything ambiguous is left for the editor to draw manually. Detection never mutates stored regions; the backend returns proposals for the user to review.

### `/extract`

Request:

```json
{
  "pdf_base64": "<base64>",
  "ocr": false,
  "regions": [
    {
      "table_id": 1,
      "page_index": 0,
      "x_start_pt": 72,
      "x_end_pt": 540,
      "y_start_pt": 120,
      "y_end_pt": 700,
      "columns": [
        { "role": "code", "x_start_pt": 72, "x_end_pt": 140 },
        { "role": "title", "x_start_pt": 140, "x_end_pt": 320 },
        { "role": "prereq", "x_start_pt": 320, "x_end_pt": 420 },
        { "role": "lec", "x_start_pt": 420, "x_end_pt": 460 },
        { "role": "lab", "x_start_pt": 460, "x_end_pt": 500 },
        { "role": "total", "x_start_pt": 500, "x_end_pt": 540 }
      ],
      "rows": [
        { "row_id": "r1", "y_top_pt": 680, "y_bottom_pt": 660 }
      ]
    }
  ]
}
```

- Every region must include all six column roles: `code`, `title`, `prereq`, `lec`, `lab`, and `total`.
- Coordinates are in PDF points with the origin at the bottom-left. Bounds must have positive width and height, and each row's `y_bottom_pt` must be below its `y_top_pt`.
- A row may include `cells` overrides (`{ "code": "CPE 311", ... }`). When present, the override wins over text read from the PDF; the editor uses this for duplicated rows and direct cell edits.
- A region whose `page_index` is outside the document returns an empty subject list instead of failing the whole request.
- `table_id` groups the output; the backend maps each group back to its stored table region.

Response:

```json
{
  "regions": [
    {
      "table_id": 1,
      "subjects": [
        {
          "code": "CPE 311",
          "title": "Data Structures and Algorithms",
          "prereq": "CPE 211",
          "lec": "3",
          "lab": "0",
          "total": "3"
        }
      ]
    }
  ]
}
```

The Pydantic models in `app/models.py` are authoritative for the full schema.

## Extraction behavior

The service uses `pypdfium2` to inspect pages and extract text. Page text and page handles are cached for the duration of a request, so multiple regions on the same page do not re-read the document. Temporary PDFs and page resources are closed after each request.

Cell text is clipped with a small left/right padding so a column does not bleed into its neighbour. The left edge is deliberately not clipped, so a short code such as `BEM 111` that begins exactly on the boundary is still captured. Row top/bottom padding is separate because tight rows would otherwise clip descenders. Whitespace is stripped by default.

## OCR

`POST /extract` accepts `ocr: true`. The service first checks whether the selected region has any text at all. Pages that already contain a text layer are never OCR'd, so normal PDFs stay fast and lossless. For pages that need it, the service:

1. Renders the page at `ocr_dpi` (default **300**).
2. Converts to grayscale, **inverts dark pages**, and normalises contrast — white-on-black text is unreadable to Tesseract otherwise.
3. Runs Tesseract with `ocr_config` (default `--oem 3 --psm 6`) and `ocr_lang` (default `eng`).
4. Drops words below `ocr_min_confidence` (default **30**) and bins the remaining words into the caller's row/column rectangles by their centres.

The text layer always wins: OCR only fills cells that come back blank. Mixed documents (real text plus one pasted image) therefore work without re-OCRing the readable pages. If OCR is requested but Tesseract is not installed, `/extract` returns `503` with `OCR is not available on the parser service.` The backend surfaces a warning when OCR ran but still found no text.

OCR is optional locally. Install the Tesseract binary on `PATH` (on Windows, the UB Mannheim build; on Debian/Ubuntu, `apt install tesseract-ocr`). The Docker image installs `tesseract-ocr` automatically.

## Configuration

Defaults live in `app/config.py` and can be overridden with environment variables or a local `.env` file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8001` | HTTP port used by the Docker command and local `python -m app.main`. |
| `LOG_LEVEL` | `info` | Python logging level. |
| `SERVICE_NAME` | `prospectus-parser` | Name reported by `/health` and startup logs. |
| `MAX_UPLOAD_BYTES` | `20971520` (20 MB) | Upload limit; mirrors the backend's multer limit. |
| `MIN_CELL_PADDING_PT` | `2.5` | Left/right clipping padding in PDF points. The tracked `.env.example` overrides this to `0.5` for local testing. |
| `ROW_PADDING_PT` | `1.0` | Top/bottom row padding in PDF points. |
| `STRIP_WHITESPACE` | `true` | Trim extracted cell text. |
| `OCR_DPI` | `300` | Render resolution for OCR. |
| `OCR_LANG` | `eng` | Tesseract language pack. |
| `OCR_CONFIG` | `--oem 3 --psm 6` | Tesseract engine and page-segmentation mode. |
| `OCR_MIN_CONFIDENCE` | `30` | Minimum Tesseract word confidence to keep. |

## Run locally

From the repository root in PowerShell:

```powershell
Set-Location packages\prospectus-parser
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Check `http://localhost:8001/health` or open `http://localhost:8001/docs`. The root `pnpm setup:venvs` command creates this virtual environment and installs the requirements; `pnpm dev` starts the parser automatically when the environment exists.

## Docker and Railway

The Dockerfile is based on `python:3.11-slim`, installs `tesseract-ocr`, copies `app/`, exposes port `8001`, and starts Uvicorn with `${PORT:-8001}` so Railway's assigned port is respected.

Railway builds the service from `packages/prospectus-parser` with the Dockerfile and keeps it private. The backend reaches it through:

```text
PROSPECTUS_PARSER_URL=http://${{coe-nnectparser.RAILWAY_PRIVATE_DOMAIN}}:${{coe-nnectparser.PORT}}
```

The health check is `/health` with a 30-second timeout. See the [Railway deployment guide](../operations/railway.md).

## Backend integration

`ProspectusParserClient` in `apps/backend/src/modules/prospectus-pdfs/parser.client.ts` owns the HTTP boundary:

| Operation | Backend timeout |
| --- | --- |
| Health/warm-up | 30 seconds |
| `/info` | 60 seconds |
| `/extract` without OCR | 60 seconds |
| `/extract` with OCR | 240 seconds |
| `/detect` | 180 seconds |

The client retries transient network errors and `502`/`503`/`504` responses, and treats a parser `503` that carries a specific detail (such as OCR unavailable) as a non-retryable user-facing error. A slow OCR run therefore has a four-minute budget, while normal extraction and page-info calls fail fast.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/extract` returns `503` with OCR unavailable | Install Tesseract and confirm it is on `PATH`; the Docker image includes it. |
| OCR finds nothing | Raise `OCR_DPI`, verify the scan is not rotated, and confirm the row/column rectangles cover the text. |
| Extraction returns empty cells | Check the region geometry in PDF points (origin bottom-left), the six column roles, and whether the page is image-only. |
| `/detect` finds no proposals | The detector only recognizes header-driven course tables; draw the region manually. |
| `/detect` skips pages | More than 40 pages were requested; narrow `page_indices`. |
| Backend reports the parser is unavailable | Confirm `PROSPECTUS_PARSER_URL`, the service `/health` response, and Railway private networking. |
| OCR request times out at the backend | The run exceeded 240 seconds; reduce the page count, lower `OCR_DPI`, or split the import. |
