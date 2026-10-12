# Prospectus Parser Service

Python FastAPI service that extracts text from prospectus PDFs given
user-drawn table regions.

**No AI. No OCR. No heuristics.** The user draws boxes over the PDF;
we return exactly the text inside those boxes.

## Why this design

Traditional PDF table parsers fail on real prospectuses because:
- Tables often have no ruled lines
- Text layers are lossy (columns collapse into strings)
- Layouts vary wildly between departments

Our approach: **the user is the ground truth.** They draw where the
data is; we extract from those coordinates. Perfect accuracy, zero
cost, zero dependencies on cloud services.

## Endpoints

### `GET /health`
Returns `{"status":"ok","service":"prospectus-parser","version":"0.1.0"}`.

### `POST /info`
Returns page count + per-page dimensions.

Body:
```json
{ "pdf_path": "/abs/path/to/file.pdf" }
  "regions": [
    {
      "table_id": 1,
      "page_index": 0,
      "x_start_pt": 200, "x_end_pt": 900,
      "y_start_pt": 400, "y_end_pt": 900,
      "columns": [
        {"role": "code",   "x_start_pt": 200, "x_end_pt": 280},
        {"role": "title",  "x_start_pt": 280, "x_end_pt": 600},
        {"role": "prereq", "x_start_pt": 600, "x_end_pt": 720},
        {"role": "lec",    "x_start_pt": 720, "x_end_pt": 760},
        {"role": "lab",    "x_start_pt": 760, "x_end_pt": 800},
        {"role": "total",  "x_start_pt": 800, "x_end_pt": 860}
      ],
      "rows": [
        {"row_id": "r1", "y_top_pt": 880, "y_bottom_pt": 860},
        {"row_id": "r2", "y_top_pt": 860, "y_bottom_pt": 840}
      ]
    }
  ]
}
Response:

json
{
  "regions": [
    {
      "table_id": 1,
      "subjects": [
        {"code": "CPE 131", "title": "Logic Circuits and Design",
         "prereq": "CPE 124, CPE 126", "lec": "3", "lab": "1", "total": "4"}
      ]
    }
  ]
}
Coordinates
All coordinates are PDF points, origin bottom-left.

This matches the internal PDF coordinate system, so no conversion
is needed inside this service. The frontend converts screen pixels
↔ PDF points at render time.

Local dev
powershell
cd packages\prospectus-parser
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
Test:

powershell
curl http://localhost:8001/health
Deploy
Railway: Root Directory = packages/prospectus-parser,
Builder = Dockerfile. No env vars required beyond defaults.

Notes
Text extraction is done with pypdfium2 (BSD-3, no system deps)

Each region's cells are extracted independently

Textpages are cached per page (regions on the same page share one)

Invalid boxes (end ≤ start) are rejected at the API boundary

text

---

## Verification — run this before I write Drop 2

**Step 1: Apply the SQL**

In Supabase SQL Editor, paste the contents of `docs/sql/2026-10-11_prospectus_pdfs.sql` and run it.

Verify:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('prospectus_pdf', 'prospectus_pdf_table');
Expected: 2 rows.

Step 2: Also create the Storage bucket

Supabase Dashboard → Storage → New Bucket → name it prospectus-pdfs, private.

Step 3: Run the parser service locally

powershell
cd packages\prospectus-parser
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
Expected log: prospectus-parser v0.1.0 ready — port=8001 max_upload=20MB

Step 4: Health check

powershell
curl http://localhost:8001/health
Expected:

json
{"status":"ok","service":"prospectus-parser","version":"0.1.0"}
Step 5: Smoke test with a real PDF

Put one of your real prospectuses at C:\temp\test.pdf (adjust path). Then:

powershell
$body = @{
  pdf_path = "C:\temp\test.pdf"
  regions = @(
    @{
      table_id = 1
      page_index = 0
      x_start_pt = 50
      x_end_pt = 550
      y_start_pt = 300
      y_end_pt = 700
      columns = @(
        @{ role = "code";   x_start_pt = 50;  x_end_pt = 110 },
        @{ role = "title";  x_start_pt = 110; x_end_pt = 350 },
        @{ role = "prereq"; x_start_pt = 350; x_end_pt = 430 },
        @{ role = "lec";    x_start_pt = 430; x_end_pt = 460 },
        @{ role = "lab";    x_start_pt = 460; x_end_pt = 490 },
        @{ role = "total";  x_start_pt = 490; x_end_pt = 550 }
      )
      rows = @(
        @{ row_id = "r1"; y_top_pt = 680; y_bottom_pt = 660 },
        @{ row_id = "r2"; y_top_pt = 660; y_bottom_pt = 640 },
        @{ row_id = "r3"; y_top_pt = 640; y_bottom_pt = 620 }
      )
    }
  )
} | ConvertTo-Json -Depth 10

curl -X POST http://localhost:8001/extract `
  -H "Content-Type: application/json" `
  -d $body
You'll get back whatever text is at those coordinates. It might not be the right subject — that's fine for the smoke test. What matters is that text comes back and doesn't crash.

If you want to debug coordinates visually, we can add a /debug/render endpoint in Drop 2 that returns a PNG with the region drawn on it. Say the word.

