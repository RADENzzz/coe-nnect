import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import {
  fetchProspectusPdf,
  fetchSignedUrl,
  createProspectusPdfTable,
  updateProspectusPdfTable,
  deleteProspectusPdfTable,
} from '@/api/prospectus-pdfs.api';
import type { ColumnSlice, ProspectusPdfTable, RowBox } from './types';
import { usePdfDocument } from './hooks/usePdfDocument';
import { usePdfTextLayer } from './hooks/usePdfTextLayer';
import { useCommitAutosave } from './hooks/useAutosave';
import {
  makeDefaultColumns,
  useRegionState,
} from './hooks/useRegionState';
import PdfCanvas from './components/PdfCanvas';
import MappingOverlay from './components/MappingOverlay';
import AddTableDialog from './components/AddTableDialog';
import LiveExtractionPreview from './components/LiveExtractionPreview';
import SaveStatusIndicator from './components/SaveStatusIndicator';
import ImportProspectusDialog from './components/ImportProspectusDialog';
import { fetchPrograms } from '@/api/programs.api';
import { useUiStore } from '@/store/ui.store';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const PAGE_PADDING_PX = 24;
const MIN_ROW_HEIGHT_PT = 6;

export default function ProspectusPdfEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [renderedDims, setRenderedDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [deleteTableId, setDeleteTableId] = useState<string | null>(null);
  const [deleteRowTarget, setDeleteRowTarget] = useState<{
    tableId: string;
    rowId: string;
  } | null>(null);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  const { data: pdfRecord, isLoading: metaLoading } = useQuery({
    queryKey: ['prospectus-pdf', id],
    queryFn: () => fetchProspectusPdf(id!),
    enabled: !!id,
  });

  const { data: signed } = useQuery({
    queryKey: ['prospectus-pdf-signed-url', id],
    queryFn: () => fetchSignedUrl(id!),
    enabled: !!id,
    staleTime: 50 * 60 * 1000,
  });

  const { pdf } = usePdfDocument(signed?.signedUrl ?? null);
  const { data: textLayer } = usePdfTextLayer(pdf, pageIndex);
  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: fetchPrograms,
    enabled: !!pdfRecord,
  });
  const initialTables = useMemo<ProspectusPdfTable[]>(
    () => pdfRecord?.tables ?? [],
    [pdfRecord],
  );

    const {
    tables,
    setTables,
    selection,
    setSelection,
    editing,
    setEditing,
    drawingMode,
    setDrawingMode,
    upsertTable,
    removeTable,
    setRows,
    setColumns,
    setRegion,
  } = useRegionState(initialTables);

  const {
    state: saveState,
    error: saveError,
    queue: queueSave,
    commit: commitSave,
  } = useCommitAutosave<{ tableId: string; patch: any }>({
    maxIdleMs: 5000,
    save: async ({ tableId, patch }) => {
      await updateProspectusPdfTable(id!, tableId, patch);
      await qc.invalidateQueries({ queryKey: ['prospectus-pdf', id] });
    },
  });

  useEffect(() => {
    setTables(initialTables);
  }, [initialTables, setTables]);

  // Commit pending autosave whenever the user exits edit mode.
  // Also collapse the global sidebar the FIRST time editing starts.
  // We never auto-expand — the user re-opens the sidebar with the
  // chevron button when they want it back.
  const prevEditingRef = useRef<string>('none');
  useEffect(() => {
    const currentKey =
      editing.kind === 'none'
        ? 'none'
        : editing.kind === 'table'
        ? `table:${editing.tableId}`
        : `row:${editing.tableId}:${editing.rowId}`;

    if (prevEditingRef.current !== currentKey) {
      const wasEditing = prevEditingRef.current !== 'none';
      const isEditing = currentKey !== 'none';

      if (wasEditing) {
        void commitSave();
      }

      // On entering edit: collapse the sidebar and nudge the zoom in
      // slightly so rows are easier to work with. We never zoom back
      // out automatically — user controls that with the toolbar.
      if (isEditing) {
        setSidebarCollapsed(true);
        setZoom((z) => (z < 1.5 ? 1.5 : z));
      }

      prevEditingRef.current = currentKey;
    }
  }, [editing, commitSave, setSidebarCollapsed]);

  // Restore the sidebar when leaving the editor page.
  useEffect(() => {
    return () => {
      setSidebarCollapsed(false);
    };
  }, [setSidebarCollapsed]);

  const pageView = useMemo(() => {
    if (!textLayer) return null;
    return { view: textLayer.view, zoom };
  }, [textLayer, zoom]);

  // ── Zoom helpers ──

  const fitPageToContainer = useCallback(() => {
    if (!textLayer || !canvasScrollRef.current) return;
    const container = canvasScrollRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const pageWpt = textLayer.view[2] - textLayer.view[0];
    const pageHpt = textLayer.view[3] - textLayer.view[1];

    const availableW = cw - PAGE_PADDING_PX * 2;
    const availableH = ch - PAGE_PADDING_PX * 2;

    let fit = Math.min(availableW / pageWpt, availableH / pageHpt);
    fit = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));

    setZoom(fit);
    requestAnimationFrame(() => {
      container.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    });
  }, [textLayer]);

  const focusOnRect = useCallback(
    (rect: {
      x_start_pt: number;
      x_end_pt: number;
      y_start_pt: number;
      y_end_pt: number;
    }) => {
      if (!textLayer || !canvasScrollRef.current) return;
      const container = canvasScrollRef.current;

      const wPt = rect.x_end_pt - rect.x_start_pt;
      const hPt = rect.y_end_pt - rect.y_start_pt;
      if (wPt <= 0 || hPt <= 0) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const availableW = (cw - PAGE_PADDING_PX * 2) * 0.9;
      const availableH = (ch - PAGE_PADDING_PX * 2) * 0.9;

      let fit = Math.min(availableW / wPt, availableH / hPt);
      fit = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));

      setZoom(fit);

      const targetCxPdf = (rect.x_start_pt + rect.x_end_pt) / 2;
      const targetCyPdf = (rect.y_start_pt + rect.y_end_pt) / 2;
      const viewX0 = textLayer.view[0];
      const viewY1 = textLayer.view[3];

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const canvasWpx = (textLayer.view[2] - viewX0) * fit;
          const canvasHpx = (viewY1 - textLayer.view[1]) * fit;
          const centerInCanvasX = (targetCxPdf - viewX0) * fit;
          const centerInCanvasY = (viewY1 - targetCyPdf) * fit;
          const centerInContentX = PAGE_PADDING_PX + centerInCanvasX;
          const centerInContentY = PAGE_PADDING_PX + centerInCanvasY;

          const scrollLeft = centerInContentX - cw / 2;
          const scrollTop = centerInContentY - ch / 2;
          const maxScrollLeft = Math.max(0, PAGE_PADDING_PX * 2 + canvasWpx - cw);
          const maxScrollTop = Math.max(0, PAGE_PADDING_PX * 2 + canvasHpx - ch);

          container.scrollTo({
            left: Math.max(0, Math.min(maxScrollLeft, scrollLeft)),
            top: Math.max(0, Math.min(maxScrollTop, scrollTop)),
            behavior: 'smooth',
          });
        });
      });
    },
    [textLayer],
  );

  useEffect(() => {
    if (textLayer && !hasAutoFitted) {
      setHasAutoFitted(true);
      requestAnimationFrame(() => fitPageToContainer());
    }
  }, [textLayer, hasAutoFitted, fitPageToContainer]);

  useEffect(() => {
    if (textLayer && hasAutoFitted) {
      requestAnimationFrame(() => fitPageToContainer());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex]);

  // ── Row height formula ──
  const computeNewRowHeight = useCallback(
    (regionHeight: number, currentRowCount: number): number => {
      const N = currentRowCount + 1;
      return regionHeight / Math.max(N + 2, 6);
    },
    [],
  );

  // ── Handlers ──

  const handleRegionDrawn = useCallback(
    async (rect: {
      x_start_pt: number;
      x_end_pt: number;
      y_start_pt: number;
      y_end_pt: number;
    }) => {
      if (!pdfRecord || drawingMode.kind !== 'drawing-region') return;
      const { yearLevel, semester } = drawingMode;

      const columns = makeDefaultColumns(rect.x_start_pt, rect.x_end_pt);
      const regionHeight = rect.y_end_pt - rect.y_start_pt;

      // Auto-create row 1
      const firstRowHeight = computeNewRowHeight(regionHeight, 0);
      const firstRow: RowBox = {
        row_id: `r_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        y_top_pt: rect.y_end_pt,
        y_bottom_pt: rect.y_end_pt - firstRowHeight,
      };

      try {
        const created = await createProspectusPdfTable(id!, {
          year_level: yearLevel,
          semester,
          region_page_index: pageIndex,
          region_x_start_pt: rect.x_start_pt,
          region_x_end_pt: rect.x_end_pt,
          region_y_start_pt: rect.y_start_pt,
          region_y_end_pt: rect.y_end_pt,
          columns,
          rows: [firstRow],
        });
        upsertTable(created);
        setSelection({ kind: 'table', tableId: created.tableId });
        setEditing({ kind: 'none' }); // locked by default
        setDrawingMode({ kind: 'idle' });
        qc.invalidateQueries({ queryKey: ['prospectus-pdf', id] });
      } catch (err) {
        console.error('Failed to create table', err);
      }
    },
    [
      computeNewRowHeight,
      drawingMode,
      id,
      pageIndex,
      pdfRecord,
      qc,
      setDrawingMode,
      setSelection,
      upsertTable,
    ],
  );

  const handleFocusDrawn = useCallback(
    (rect: {
      x_start_pt: number;
      x_end_pt: number;
      y_start_pt: number;
      y_end_pt: number;
    }) => {
      focusOnRect(rect);
      setDrawingMode({ kind: 'idle' });
    },
    [focusOnRect, setDrawingMode],
  );

  const handleAddRow = useCallback(
    (tableId: string) => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;

      const regionYStart = Number(table.regionYStartPt);
      const regionYEnd = Number(table.regionYEndPt);
      const regionHeight = regionYEnd - regionYStart;

      // Position: below the last row's bottommost point
      const sorted = [...table.rows].sort((a, b) => b.y_top_pt - a.y_top_pt);
      const lastRow =
        sorted.length > 0 ? sorted[sorted.length - 1] : null;

      const newHeight = computeNewRowHeight(regionHeight, table.rows.length);
      const newTop = lastRow ? lastRow.y_bottom_pt : regionYEnd;
      let newBottom = newTop - newHeight;

      let newRegionYStart = regionYStart;

      // Auto-grow: if new row would overflow, extend the region downward
      if (newBottom < regionYStart) {
        const needed = regionYStart - newBottom;
        newRegionYStart = Math.max(0, regionYStart - needed);
        // Reset the row to fit the expanded region
        newBottom = newTop - newHeight;
        if (newBottom < newRegionYStart) {
          newBottom = newRegionYStart;
        }
      }

      const row: RowBox = {
        row_id: `r_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        y_top_pt: newTop,
        y_bottom_pt: newBottom,
      };

      const nextRows = [...table.rows, row];
      setRows(tableId, nextRows);

      const patch: any = { rows: nextRows };
      if (newRegionYStart !== regionYStart) {
        setRegion(tableId, {
          pageIndex: table.regionPageIndex,
          xStart: Number(table.regionXStartPt),
          xEnd: Number(table.regionXEndPt),
          yStart: newRegionYStart,
          yEnd: regionYEnd,
        });
        patch.region_y_start_pt = newRegionYStart;
      }

      queueSave({ tableId, patch });
    },
    [tables, computeNewRowHeight, queueSave, setRows, setRegion],
  );

  const handleRowSelectAndFocus = useCallback(
    (tableId: string, rowId: string) => {
      setSelection({ kind: 'row', tableId, rowId });
      const table = tables.find((t) => t.tableId === tableId);
      const row = table?.rows.find((r) => r.row_id === rowId);
      if (!table || !row) return;
      focusOnRect({
        x_start_pt: Number(table.regionXStartPt),
        x_end_pt: Number(table.regionXEndPt),
        y_start_pt: row.y_bottom_pt,
        y_end_pt: row.y_top_pt,
      });
    },
    [tables, focusOnRect],
  );

  const handleColumnsChange = useCallback(
    (tableId: string, columns: ColumnSlice[]) => {
      setColumns(tableId, columns);
      queueSave({ tableId, patch: { columns } });
    },
    [queueSave, setColumns],
  );

  const handleRegionChange = useCallback(
    (
      tableId: string,
      region: { xStart: number; xEnd: number; yStart: number; yEnd: number },
    ) => {
      setRegion(tableId, {
        pageIndex,
        xStart: region.xStart,
        xEnd: region.xEnd,
        yStart: region.yStart,
        yEnd: region.yEnd,
      });
      queueSave({
        tableId,
        patch: {
          region_page_index: pageIndex,
          region_x_start_pt: region.xStart,
          region_x_end_pt: region.xEnd,
          region_y_start_pt: region.yStart,
          region_y_end_pt: region.yEnd,
        },
      });
    },
    [pageIndex, queueSave, setRegion],
  );

  const handleRowChange = useCallback(
    (tableId: string, rowId: string, next: RowBox) => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;
      const nextRows = table.rows.map((r) => (r.row_id === rowId ? next : r));
      setRows(tableId, nextRows);
      queueSave({ tableId, patch: { rows: nextRows } });
    },
    [tables, queueSave, setRows],
  );

  const confirmDeleteTable = useCallback(async () => {
    if (!deleteTableId || !id) return;
    try {
      await deleteProspectusPdfTable(id, deleteTableId);
      removeTable(deleteTableId);
      setDeleteTableId(null);
      qc.invalidateQueries({ queryKey: ['prospectus-pdf', id] });
    } catch (err) {
      console.error('Failed to delete table', err);
    }
  }, [deleteTableId, id, qc, removeTable]);

  const confirmDeleteRow = useCallback(async () => {
    if (!deleteRowTarget) return;
    const { tableId, rowId } = deleteRowTarget;
    const table = tables.find((t) => t.tableId === tableId);
    if (!table) return;
    const nextRows = table.rows.filter((r) => r.row_id !== rowId);
    setRows(tableId, nextRows);
    setDeleteRowTarget(null);
    queueSave({ tableId, patch: { rows: nextRows } });
  }, [deleteRowTarget, queueSave, setRows, tables]);

  const handleCanvasRendered = useCallback(
    (dims: { width: number; height: number }) => setRenderedDims(dims),
    [],
  );

  const selectedTable = useMemo(() => {
    if (selection.kind === 'none') return null;
    return tables.find((t) => t.tableId === selection.tableId) ?? null;
  }, [selection, tables]);

  if (metaLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-on-surface-variant">
        <Icon name="progress_activity" size={24} className="animate-spin" />
        <span className="ml-3">Loading PDF record…</span>
      </div>
    );
  }

  if (!pdfRecord) {
    return (
      <div className="text-center py-16">
        <p className="text-on-surface font-semibold mb-2">PDF not found</p>
        <Link to="/import" className="text-primary text-sm hover:underline">
          Back to Import
        </Link>
      </div>
    );
  }

  const totalPages = pdfRecord.pageCount;
  const cursorClass =
    drawingMode.kind === 'drawing-region' || drawingMode.kind === 'focusing'
      ? 'cursor-crosshair'
      : '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <button
            onClick={() => navigate('/import')}
            className="text-xs text-on-surface-variant hover:text-primary flex items-center gap-1 mb-1"
          >
            <Icon name="arrow_back" size={14} />
            Back to Import
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-on-surface truncate">
              {pdfRecord.originalFilename}
            </h1>
            <SaveStatusIndicator state={saveState} error={saveError} />
          </div>
          <p className="text-on-surface-variant text-xs mt-0.5">
            {pdfRecord.pageCount} page
            {pdfRecord.pageCount === 1 ? '' : 's'} ·{' '}
            {tables.length} of 12 tables mapped
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawingMode({ kind: 'focusing' })}
            disabled={drawingMode.kind !== 'idle'}
            className="px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold hover:bg-surface-container-low transition disabled:opacity-50 flex items-center gap-1.5"
            title="Draw a rectangle to zoom into that area"
          >
            <Icon name="center_focus_strong" size={16} />
            Focus
          </button>

          <button
            onClick={() => setAddTableOpen(true)}
            disabled={drawingMode.kind !== 'idle'}
            className="px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold hover:bg-surface-container-low transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <Icon name="add" size={16} />
            Add Table
          </button>

          <button
            onClick={() => setImportOpen(true)}
            disabled={tables.length === 0 || drawingMode.kind !== 'idle'}
            className="px-3 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-1.5"
            title="Extract and import subjects from this PDF"
          >
            <Icon name="upload" size={16} />
            Import
          </button>
        </div>
      </div>

      {/* Drawing mode banner */}
      {drawingMode.kind !== 'idle' && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center gap-3 ${
            drawingMode.kind === 'focusing'
              ? 'bg-amber-100 border-amber-300 text-amber-900'
              : 'bg-blue-100 border-blue-300 text-blue-900'
          }`}
        >
          <Icon name="info" size={18} className="shrink-0" />
          <div className="flex-1">
            {drawingMode.kind === 'drawing-region' && (
              <>
                Drag a rectangle on the PDF to mark the{' '}
                <strong>
                  Year {drawingMode.yearLevel} {drawingMode.semester}
                </strong>{' '}
                semester. Row 1 will be created automatically.
              </>
            )}
            {drawingMode.kind === 'focusing' && (
              <>
                Drag a rectangle to <strong>zoom into that area</strong>.
              </>
            )}
          </div>
          <button
            onClick={() => setDrawingMode({ kind: 'idle' })}
            className="px-3 py-1 rounded text-xs font-semibold bg-white/60 hover:bg-white transition"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-surface-variant bg-surface-container-lowest flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
            className="p-2 rounded hover:bg-surface-container-high disabled:opacity-30"
          >
            <Icon name="chevron_left" size={18} />
          </button>
          <span className="text-sm font-mono px-2 whitespace-nowrap">
            Page {pageIndex + 1} / {totalPages}
          </span>
          <button
            onClick={() =>
              setPageIndex((p) => Math.min(totalPages - 1, p + 1))
            }
            disabled={pageIndex >= totalPages - 1}
            className="p-2 rounded hover:bg-surface-container-high disabled:opacity-30"
          >
            <Icon name="chevron_right" size={18} />
          </button>
        </div>

        <div className="h-5 w-px bg-surface-variant" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
            className="p-2 rounded hover:bg-surface-container-high"
          >
            <Icon name="zoom_out" size={18} />
          </button>
          <span className="text-xs font-mono w-14 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
            className="p-2 rounded hover:bg-surface-container-high"
          >
            <Icon name="zoom_in" size={18} />
          </button>
          <div className="h-5 w-px bg-surface-variant mx-1" />
          <button
            onClick={fitPageToContainer}
            className="p-2 rounded hover:bg-surface-container-high"
            title="Fit page to screen"
          >
            <Icon name="fit_screen" size={18} />
          </button>
          <button
            onClick={() => {
              setZoom(1.0);
              requestAnimationFrame(() =>
                canvasScrollRef.current?.scrollTo({
                  left: 0,
                  top: 0,
                  behavior: 'smooth',
                }),
              );
            }}
            className="p-2 rounded hover:bg-surface-container-high"
            title="Reset to 100%"
          >
            <Icon name="restart_alt" size={18} />
          </button>
        </div>
      </div>

      {/* Canvas + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div
          ref={canvasScrollRef}
          className={`rounded-lg border border-surface-variant bg-surface-container-low overflow-auto p-4 md:p-6 min-h-[600px] ${cursorClass}`}
        >
          {!signed && (
            <div className="max-w-2xl mx-auto text-center py-16">
              <Icon
                name="progress_activity"
                size={32}
                className="text-primary mx-auto mb-3 animate-spin"
              />
              <p className="text-on-surface-variant text-sm">
                Preparing signed URL…
              </p>
            </div>
          )}

          {signed && pdf && textLayer && (
            <div className="text-center whitespace-nowrap">
              <div
                className="relative inline-block align-top"
                style={{ whiteSpace: 'normal' }}
              >
                <PdfCanvas
                  pdf={pdf}
                  pageIndex={pageIndex}
                  zoom={zoom}
                  onRendered={handleCanvasRendered}
                />
                {renderedDims && pageView && (
                  <MappingOverlay
                    canvasWidth={renderedDims.width}
                    canvasHeight={renderedDims.height}
                    pageIndex={pageIndex}
                    pageView={pageView}
                    tables={tables}
                    selection={selection}
                    editing={editing}
                    drawingMode={drawingMode}
                    onSelect={setSelection}
                    onEditingChange={setEditing}
                    onRegionDrawn={handleRegionDrawn}
                    onFocusDrawn={handleFocusDrawn}
                    onTableDelete={setDeleteTableId}
                    onColumnsChange={handleColumnsChange}
                    onRegionChange={handleRegionChange}
                    onRowChange={handleRowChange}
                    onRowDelete={(tableId, rowId) =>
                      setDeleteRowTarget({ tableId, rowId })
                    }
                    onRowSelect={handleRowSelectAndFocus}
                    onAddRow={handleAddRow}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <LiveExtractionPreview
            table={selectedTable}
            textItems={textLayer?.items ?? null}
          />

          <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-3 text-xs text-on-surface-variant space-y-2">
            <div className="font-semibold text-on-surface">How to use</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Click <strong>Add Table</strong> → pick Year + Semester.
              </li>
              <li>Drag a rectangle over that semester's table.</li>
              <li>Row 1 is created automatically.</li>
              <li>
                Click <strong>+ Add row</strong> inside the region to add
                more rows.
              </li>
              <li>
                To move/resize a row, click its <strong>number badge</strong>{' '}
                to unlock edit mode.
              </li>
              <li>
                To move/resize the region, click its <strong>label chip</strong>{' '}
                (the "Year X · Sem" header).
              </li>
              <li>
                Drag the color-coded column handles to align with the PDF
                columns.
              </li>
              <li>
                Click <strong>Focus</strong> and drag over an area to zoom
                into it.
              </li>
            </ol>
          </div>
        </div>
      </div>

      <AddTableDialog
        open={addTableOpen}
        onClose={() => setAddTableOpen(false)}
        existingTables={tables}
        onConfirm={(yearLevel, semester) => {
          setAddTableOpen(false);
          setDrawingMode({ kind: 'drawing-region', yearLevel, semester });
        }}
      />

      <Modal
        open={!!deleteTableId}
        onClose={() => setDeleteTableId(null)}
        title="Delete this table?"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setDeleteTableId(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteTable}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This will also delete all rows in the table. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={!!deleteRowTarget}
        onClose={() => setDeleteRowTarget(null)}
        title="Delete this row?"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setDeleteRowTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteRow}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition"
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove this subject row from the table?
        </p>
      </Modal>
      <ImportProspectusDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        pdfId={id!}
        tables={tables}
        programs={programs}
        departmentId={String(pdfRecord.departmentId)}
      />
    </div>
  );
}