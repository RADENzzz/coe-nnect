-- Let rows added through the PDF editor read the text underneath them again.
--
-- The editor used to create every "Add row", "Add above", and "Add below" row
-- with `blank: true`. That marker tells the extractor to return empty text
-- even when a real PDF text line sits inside the row's geometry, so only the
-- first row of a table ever extracted anything.
--
-- The editor no longer creates blank rows; new rows are snapped to the next
-- PDF text baseline. This migration removes the stale marker from rows that
-- were saved by the old editor so those tables start reading again.

WITH cleaned AS (
    SELECT
        t.table_id,
        jsonb_agg(
            row_data.row - 'blank'
            ORDER BY row_data.ord
        ) AS rows
    FROM public.prospectus_pdf_table AS t
    CROSS JOIN LATERAL jsonb_array_elements(t.rows)
        WITH ORDINALITY AS row_data(row, ord)
    GROUP BY t.table_id
)
UPDATE public.prospectus_pdf_table AS t
SET rows = cleaned.rows
FROM cleaned
WHERE t.table_id = cleaned.table_id
  AND t.rows IS DISTINCT FROM cleaned.rows;
