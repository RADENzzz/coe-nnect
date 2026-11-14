-- Clean up empty cell overrides written by the old row-snapshot logic.
--
-- The editor used to pin every extracted cell, including empty strings, into a
-- row's `cells` object whenever the row moved or a row was inserted above it.
-- Once persisted, those empty strings looked like deliberate user edits and
-- hid the real PDF text under the row.
--
-- New rows use an explicit `blank` marker for genuinely empty rows, and only
-- non-empty text is pinned. This migration removes the bogus empty overrides
-- from rows saved by the old editor:
--   * a cells object with only empty values becomes `blank: true`
--   * a cells object with some text keeps only its non-empty values
--   * rows without a cells object are untouched

WITH cleaned AS (
    SELECT
        t.table_id,
        jsonb_agg(
            CASE
                WHEN jsonb_typeof(row_data.row -> 'cells') = 'object' THEN
                    CASE
                        -- Every override was empty: this is an inserted blank
                        -- row, not a row with six cleared cells.
                        WHEN NOT EXISTS (
                            SELECT 1
                            FROM jsonb_each_text(row_data.row -> 'cells') AS cell
                            WHERE btrim(cell.value) <> ''
                        ) THEN
                            (row_data.row - 'cells')
                            || jsonb_build_object('blank', true)
                        -- Mixed values: keep the real text and drop the empty
                        -- pins so PDF extraction resumes for those roles.
                        WHEN EXISTS (
                            SELECT 1
                            FROM jsonb_each_text(row_data.row -> 'cells') AS cell
                            WHERE btrim(cell.value) = ''
                        ) THEN
                            jsonb_set(
                                row_data.row,
                                '{cells}',
                                (
                                    SELECT jsonb_object_agg(cell.key, cell.value)
                                    FROM jsonb_each_text(row_data.row -> 'cells') AS cell
                                    WHERE btrim(cell.value) <> ''
                                )
                            )
                        ELSE row_data.row
                    END
                ELSE row_data.row
            END
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
