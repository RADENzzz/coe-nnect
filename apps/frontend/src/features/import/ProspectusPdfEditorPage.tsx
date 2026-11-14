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
import type {
  ColumnRole,
  ColumnSlice,
  ProspectusPdf,
  ProspectusPdfTable,
  RowBox,
} from './types';
import { usePdfDocument } from './hooks/usePdfDocument';
import { usePdfTextLayer, type TextItem } from './hooks/usePdfTextLayer';
import { useRegionState } from './hooks/useRegionState';
import PdfCanvas from './components/PdfCanvas';
import MappingOverlay from './components/MappingOverlay';
import AddTableDialog from './components/AddTableDialog';
import LiveExtractionPreview from './components/LiveExtractionPreview';
import ExtractedTableModal from './components/ExtractedTableModal';
import ImportProspectusDialog from './components/ImportProspectusDialog';
import TableRowsEditor from './components/TableRowsEditor';
import ElectiveColumnsEditor from './components/ElectiveColumnsEditor';
import TableNameEditor from './components/TableNameEditor';
import AutoDetectDialog from './components/AutoDetectDialog';
import { useExtractedTableData } from './hooks/useExtractedTableData';
import {
  defaultRowHeight,
  insertRow,
  moveRow,
  rowHeight,
  snapshotRow,
  sortRowsTopDown,
  type RowSnapshot,
} from './utils/rows';
import {
  detectTableName,
  detectTextLines,
  insertionRowHeight,
  nextRowHeightBelow,
  rowsFromTextLines,
} from './utils/rowDetection';
import { detectColumns } from './utils/columnDetection';
import { shortTableLabel, yearTermLabel } from './utils/labels';
import { fetchPrograms } from '@/api/programs.api';
import { useUiStore } from '@/store/ui.store';
import { MAX_TABLES, SEMESTER_ORDER } from './constants';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const PAGE_PADDING_PX = 24;

export default function ProspectusPdfEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setSidebarHidden = useUiStore((s) => s.setSidebarHidden);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [renderedDims, setRenderedDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);
  const [deleteTableId, setDeleteTableId] = useState<string | null>(null);
  const [deleteRowTarget, setDeleteRowTarget] = useState<{
    tableId: string;
    rowId: string;
  } | null>(null);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [dirtyTableIds, setDirtyTableIds] = useState<Set<string>>(new Set());
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

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
    setLabel,
    setRegion,
  } = useRegionState(initialTables);

  // Refetching the PDF record (after a save or an import) must not overwrite
  // tables that still have unsaved local edits.
  const dirtyTableIdsRef = useRef(dirtyTableIds);
  useEffect(() => {
    dirtyTableIdsRef.current = dirtyTableIds;
  }, [dirtyTableIds]);
  const tablesRef = useRef(tables);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    setTables(
      initialTables.map((incoming) => {
        if (!dirtyTableIdsRef.current.has(incoming.tableId)) return incoming;
        return (
          tablesRef.current.find((t) => t.tableId === incoming.tableId) ??
          incoming
        );
      }),
    );
  }, [initialTables, setTables]);

  const selectedTable = useMemo(() => {
    if (selection.kind === 'none') return null;
    return tables.find((t) => t.tableId === selection.tableId) ?? null;
  }, [selection, tables]);

  // Extraction always reads the selected table's own page, which is not
  // necessarily the page currently displayed on the canvas.
  const { data: selectedTableTextLayer } = usePdfTextLayer(
    pdf,
    selectedTable?.regionPageIndex ?? pageIndex,
  );

  const textItemsForTable = useCallback(
    (table: ProspectusPdfTable): TextItem[] | null => {
      if (table.regionPageIndex === pageIndex) return textLayer?.items ?? null;
      if (table.regionPageIndex === selectedTable?.regionPageIndex) {
        return selectedTableTextLayer?.items ?? null;
      }
      return null;
    },
    [
      pageIndex,
      textLayer?.items,
      selectedTable?.regionPageIndex,
      selectedTableTextLayer?.items,
    ],
  );

  // The heading printed above the selected elective rows. Used as the default
  // for the table-name editor's "Use heading" action.
  const selectedTableHeading = useMemo(() => {
    if (!selectedTable || (selectedTable.tableKind ?? 'regular') !== 'elective') {
      return null;
    }
    const items = textItemsForTable(selectedTable);
    if (!items) return null;
    return detectTableName(items, {
      x_start_pt: Number(selectedTable.regionXStartPt),
      x_end_pt: Number(selectedTable.regionXEndPt),
      y_start_pt: Number(selectedTable.regionYStartPt),
      y_end_pt: Number(selectedTable.regionYEndPt),
    });
  }, [selectedTable, textItemsForTable]);

  // Hide sidebar when editing
  const prevEditingRef = useRef<string>('none');
  useEffect(() => {
    const currentKey =
      editing.kind === 'none'
        ? 'none'
        : editing.kind === 'table'
        ? `table:${editing.tableId}`
        : `row:${editing.tableId}:${editing.rowId}`;

    if (prevEditingRef.current !== currentKey) {
      const isEditing = currentKey !== 'none';
      if (isEditing) {
        setSidebarHidden(true);
      } else {
        setSidebarHidden(false);
        setSidebarCollapsed(true);
      }
      prevEditingRef.current = currentKey;
    }
  }, [editing, setSidebarHidden, setSidebarCollapsed]);

  // Cleanup on exit
  useEffect(() => {
    return () => {
      useUiStore.getState().setSidebarHidden(false);
    };
  }, []);

  // ── Navigation Blocking & Unsaved Changes Prompt ──
  const isDirty = dirtyTableIds.size > 0;
  // Add Table / Auto-detect both change the table list. Running them while a
  // table is being edited would leave its Save/Cancel flow pointing at a
  // stale table, so they stay locked until the user saves or cancels.
  //
  // The lock only applies while the edited table/row still exists and is
  // still selected. Otherwise deleting the edited table (or moving to a
  // different table) would leave an invisible edit session blocking Add
  // Table. Leaving edit mode this way does not discard local changes: they
  // stay in `tables` and in `dirtyTableIds` until saved or cancelled.
  const editingTable =
    editing.kind === 'none'
      ? null
      : tables.find((t) => t.tableId === editing.tableId) ?? null;
  const editingLocked =
    editing.kind !== 'none' &&
    editingTable !== null &&
    (editing.kind !== 'row' ||
      editingTable.rows.some((row) => row.row_id === editing.rowId)) &&
    selection.kind !== 'none' &&
    selection.tableId === editing.tableId;

  useEffect(() => {
    if (editing.kind !== 'none' && !editingLocked) {
      setEditing({ kind: 'none' });
    }
  }, [editing, editingLocked, setEditing]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleSaveAndLeave = async () => {
    try {
      setIsSaving(true);
      await Promise.all(
        Array.from(dirtyTableIds).map((tableId) => {
          const table = tables.find((t) => t.tableId === tableId);
          if (!table) return null;
          return updateProspectusPdfTable(id!, tableId, {
            rows: table.rows,
            columns: table.columns,
            label: table.label ?? null,
            region_page_index: table.regionPageIndex,
            region_x_start_pt: Number(table.regionXStartPt),
            region_x_end_pt: Number(table.regionXEndPt),
            region_y_start_pt: Number(table.regionYStartPt),
            region_y_end_pt: Number(table.regionYEndPt),
          });
        })
      );
      setDirtyTableIds(new Set());
      if (pendingNavigation) navigate(pendingNavigation);
    } catch (err) {
      console.error('Failed to save before leaving', err);
      alert('Failed to save changes. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardAndLeave = () => {
    setDirtyTableIds(new Set());
    if (pendingNavigation) navigate(pendingNavigation);
  };

  const attemptNavigate = (to: string) => {
    if (isDirty) {
      setPendingNavigation(to);
    } else {
      navigate(to);
    }
  };

  const markDirty = (tableId: string) => {
    setDirtyTableIds((prev) => {
      const next = new Set(prev);
      next.add(tableId);
      return next;
    });
  };

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
          const maxScrollLeft = Math.max(
            0,
            PAGE_PADDING_PX * 2 + canvasWpx - cw,
          );
          const maxScrollTop = Math.max(
            0,
            PAGE_PADDING_PX * 2 + canvasHpx - ch,
          );

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
  }, [pageIndex]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const inInput =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable;
      if (inInput) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setPageIndex((p) => Math.max(0, p - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPageIndex((p) =>
            Math.min((pdfRecord?.pageCount ?? 1) - 1, p + 1),
          );
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoom((z) => Math.min(MAX_ZOOM, z + 0.15));
          break;
        case '-':
        case '_':
          e.preventDefault();
          setZoom((z) => Math.max(MIN_ZOOM, z - 0.15));
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          fitPageToContainer();
          break;
        case '0':
          e.preventDefault();
          setZoom(1.0);
          requestAnimationFrame(() =>
            canvasScrollRef.current?.scrollTo({
              left: 0,
              top: 0,
              behavior: 'smooth',
            }),
          );
          break;
        case 'Escape':
          if (drawingMode.kind !== 'idle') {
            e.preventDefault();
            setDrawingMode({ kind: 'idle' });
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pdfRecord?.pageCount, drawingMode.kind, fitPageToContainer, setDrawingMode]);

  // ── Ctrl + wheel zoom ──
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      setZoom((z) => {
        const next = z + dir * 0.1;
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Handlers ──
  const handleRegionDrawn = useCallback(
    async (rect: {
      x_start_pt: number;
      x_end_pt: number;
      y_start_pt: number;
      y_end_pt: number;
    }) => {
      if (!pdfRecord || drawingMode.kind !== 'drawing-region') return;
      const { yearLevel, semester, tableKind } = drawingMode;
      const typedLabel = drawingMode.label?.trim().slice(0, 200) ?? '';

      // Read the header labels inside the drawn region and build columns that
      // line up with this table's actual layout. Electives may have only a
      // total column, a lec/lab/total split, or a single lec/lab column.
      const columns = detectColumns(textLayer?.items ?? [], rect, tableKind);

      // Elective pools print their group heading above the rows. Use a typed
      // name first, otherwise adopt the nearest all-caps heading so the table
      // is named "SOFTWARE DEVELOPMENT" instead of only "Elective".
      const label =
        typedLabel ||
        (tableKind === 'elective'
          ? detectTableName(textLayer?.items ?? [], rect)
          : null);
      const regionHeight = rect.y_end_pt - rect.y_start_pt;

      // Create one row per text baseline in the drawn region. The old editor
      // only created a single row, so every later "Add row" landed on
      // geometry that did not line up with the PDF text.
      const lines = textLayer
        ? detectTextLines(
            textLayer.items,
            rect.x_start_pt,
            rect.x_end_pt,
            rect.y_start_pt,
            rect.y_end_pt,
            columns,
          )
        : [];
      let rows = rowsFromTextLines(lines, rect.y_start_pt, rect.y_end_pt);

      if (rows.length === 0) {
        const firstRowHeight = defaultRowHeight(regionHeight, 0);
        rows = [
          {
            row_id: `r_${Date.now().toString(36)}_${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            y_top_pt: rect.y_end_pt,
            y_bottom_pt: rect.y_end_pt - firstRowHeight,
          },
        ];
      }

      try {
        const created = await createProspectusPdfTable(id!, {
          year_level: tableKind === 'elective' ? null : yearLevel,
          semester: tableKind === 'elective' ? null : semester,
          table_kind: tableKind,
          label: label ?? undefined,
          region_page_index: pageIndex,
          region_x_start_pt: rect.x_start_pt,
          region_x_end_pt: rect.x_end_pt,
          region_y_start_pt: rect.y_start_pt,
          region_y_end_pt: rect.y_end_pt,
          columns,
          rows,
        });
        upsertTable(created);
        setSelection({ kind: 'table', tableId: created.tableId });
        setEditing({ kind: 'none' });
        setDrawingMode({ kind: 'idle' });
        setTableError(null);
        qc.invalidateQueries({ queryKey: ['prospectus-pdf', id] });
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message ?? 'Failed to create the table';
        setTableError(
          Array.isArray(message) ? message.join(', ') : String(message),
        );
        setDrawingMode({ kind: 'idle' });
        console.error('Failed to create table', err);
      }
    },
    [
      drawingMode,
      id,
      pageIndex,
      pdfRecord,
      qc,
      setDrawingMode,
      setEditing,
      setSelection,
      textLayer,
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

  /**
   * Shared insert path: keep the row array, region bottom, and dirty flag in
   * sync no matter whether the user adds at the end, above, below, or copies.
   */
  const applyRowInsert = useCallback(
    (
      tableId: string,
      sortedIndex: number,
      options: {
        height?: number;
        cells?: Partial<Record<ColumnRole, string>>;
        pinnedEmpty?: ColumnRole[];
        blank?: boolean;
      } = {},
    ) => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return null;

      // Rows below the insertion point move down, so their PDF bands change.
      // Pin what they currently show before shifting them.
      const sorted = sortRowsTopDown(table.rows);
      const pinSnapshots: Record<string, RowSnapshot> = {};
      for (const row of sorted.slice(sortedIndex)) {
        pinSnapshots[row.row_id] = snapshotRow(
          table,
          row,
          textItemsForTable(table),
        );
      }

      const result = insertRow(table, sortedIndex, {
        ...options,
        pinSnapshots,
      });
      setRows(tableId, result.rows);

      if (result.regionYStart !== Number(table.regionYStartPt)) {
        setRegion(tableId, {
          pageIndex: table.regionPageIndex,
          xStart: Number(table.regionXStartPt),
          xEnd: Number(table.regionXEndPt),
          yStart: result.regionYStart,
          yEnd: Number(table.regionYEndPt),
        });
      }
      markDirty(tableId);
      return result.insertedRowId;
    },
    [tables, setRows, setRegion, textItemsForTable],
  );

  const detectedLinesForTable = useCallback(
    (table: ProspectusPdfTable) => {
      const items = textItemsForTable(table);
      if (!items) return [];
      return detectTextLines(
        items,
        Number(table.regionXStartPt),
        Number(table.regionXEndPt),
        Number(table.regionYStartPt),
        Number(table.regionYEndPt),
        table.columns,
      );
    },
    [textItemsForTable],
  );

  const handleAddRow = useCallback(
    (tableId: string) => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;

      // Snap the new row to the next unclaimed PDF text line instead of
      // making it blank. Without this, every row added after the first one
      // showed empty cells even though the PDF text was right underneath.
      const height = nextRowHeightBelow(
        detectedLinesForTable(table),
        table.rows,
        Number(table.regionYStartPt),
        Number(table.regionYEndPt),
      );
      const inserted = applyRowInsert(
        tableId,
        table.rows.length,
        height != null ? { height } : {},
      );
      if (inserted) {
        setSelection({ kind: 'row', tableId, rowId: inserted });
      }
    },
    [tables, applyRowInsert, detectedLinesForTable, setSelection],
  );

  const handleAddRowAt = useCallback(
    (tableId: string, rowId: string, where: 'above' | 'below') => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;
      const sorted = sortRowsTopDown(table.rows);
      const index = sorted.findIndex((row) => row.row_id === rowId);
      if (index === -1) return;
      const insertionIndex = where === 'above' ? index : index + 1;
      const height = insertionRowHeight(
        detectedLinesForTable(table),
        table.rows,
        insertionIndex,
        Number(table.regionYStartPt),
        Number(table.regionYEndPt),
      );
      const inserted = applyRowInsert(
        tableId,
        insertionIndex,
        height != null ? { height } : {},
      );
      if (inserted) {
        setSelection({ kind: 'row', tableId, rowId: inserted });
      }
    },
    [tables, applyRowInsert, detectedLinesForTable, setSelection],
  );

  const handleDuplicateRow = useCallback(
    (tableId: string, rowId: string) => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;
      const sorted = sortRowsTopDown(table.rows);
      const index = sorted.findIndex((row) => row.row_id === rowId);
      if (index === -1) return;
      const source = sorted[index];
      const snapshot = snapshotRow(table, source, textItemsForTable(table));
      const inserted = applyRowInsert(tableId, index + 1, {
        height: rowHeight(source),
        ...(source.blank
          ? { blank: true }
          : {
              cells: snapshot.cells,
              pinnedEmpty: snapshot.pinnedEmpty,
            }),
      });
      if (inserted) {
        setSelection({ kind: 'row', tableId, rowId: inserted });
      }
    },
    [tables, applyRowInsert, textItemsForTable, setSelection],
  );

  const handleMoveRow = useCallback(
    (tableId: string, rowId: string, direction: 'up' | 'down') => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;
      const next = moveRow(table, rowId, direction);
      if (!next) return;
      setRows(tableId, next);
      markDirty(tableId);
    },
    [tables, setRows],
  );

  /**
   * Editing a cell snapshots the whole row first. That keeps the other five
   * cells stable if the row is later moved or nudged, instead of mixing
   * frozen overrides with live PDF extraction.
   */
  const handleRowCellChange = useCallback(
    (
      tableId: string,
      rowId: string,
      role: ColumnRole,
      value: string,
    ) => {
      const table = tables.find((t) => t.tableId === tableId);
      const row = table?.rows.find((r) => r.row_id === rowId);
      if (!table || !row) return;

      const snapshot = snapshotRow(table, row, textItemsForTable(table));
      const nextPinnedEmpty = snapshot.pinnedEmpty.filter((r) => r !== role);
      const nextRow: RowBox = {
        ...row,
        cells: { ...snapshot.cells, [role]: value },
      };
      // Editing a blank row turns it into a normal, partially-filled row.
      delete nextRow.blank;
      if (nextPinnedEmpty.length) nextRow.pinned_empty = nextPinnedEmpty;
      else delete nextRow.pinned_empty;

      setRows(
        tableId,
        table.rows.map((r) => (r.row_id === rowId ? nextRow : r)),
      );
      markDirty(tableId);
    },
    [tables, setRows, textItemsForTable],
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
    [tables, focusOnRect, setSelection],
  );

  const handleColumnsChange = useCallback(
    (tableId: string, columns: ColumnSlice[]) => {
      setColumns(tableId, columns);
      markDirty(tableId);
    },
    [setColumns],
  );

  const handleLabelChange = useCallback(
    (tableId: string, label: string | null) => {
      setLabel(tableId, label);
      markDirty(tableId);
    },
    [setLabel],
  );

  /**
   * Re-read the header inside an existing table region. This is the manual
   * correction path for auto-detect: unlike region draw it never falls back
   * to a guessed layout, so a failed read leaves the current columns intact.
   */
  const handleRedetectColumns = useCallback(
    (tableId: string) => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;
      const items = textItemsForTable(table);
      if (!items) {
        setTableError(
          'The PDF text layer is still loading. Try again in a moment.',
        );
        return;
      }

      const columns = detectColumns(
        items,
        {
          x_start_pt: Number(table.regionXStartPt),
          x_end_pt: Number(table.regionXEndPt),
          y_start_pt: Number(table.regionYStartPt),
          y_end_pt: Number(table.regionYEndPt),
        },
        table.tableKind ?? 'regular',
        { fallbackToDefault: false },
      );

      if (columns.length === 0) {
        setTableError(
          'Could not read a column header inside this table. Adjust the region or pick a layout preset instead.',
        );
        return;
      }

      setTableError(null);
      handleColumnsChange(tableId, columns);
    },
    [tables, textItemsForTable, handleColumnsChange],
  );

  const handleAutoDetected = useCallback(
    (created: ProspectusPdfTable[]) => {
      created.forEach(upsertTable);
      setTableError(null);
      void qc.invalidateQueries({ queryKey: ['prospectus-pdf', id] });

      const first = created[0];
      if (!first) return;
      setPageIndex(first.regionPageIndex);
      setSelection({ kind: 'table', tableId: first.tableId });
      setEditing({ kind: 'none' });
      const rect = {
        x_start_pt: Number(first.regionXStartPt),
        x_end_pt: Number(first.regionXEndPt),
        y_start_pt: Number(first.regionYStartPt),
        y_end_pt: Number(first.regionYEndPt),
      };
      setTimeout(() => focusOnRect(rect), 120);
    },
    [upsertTable, qc, id, focusOnRect, setEditing, setSelection],
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
      markDirty(tableId);
    },
    [pageIndex, setRegion],
  );

  const handleRowChange = useCallback(
    (tableId: string, rowId: string, next: RowBox) => {
      const table = tables.find((t) => t.tableId === tableId);
      if (!table) return;
      const nextRows = table.rows.map((r) => (r.row_id === rowId ? next : r));
      setRows(tableId, nextRows);
      markDirty(tableId);
    },
    [tables, setRows],
  );

  const handleSaveTable = async (tableId: string) => {
    const table = tables.find((t) => t.tableId === tableId);
    if (!table) return;
    setIsSaving(true);
    try {
      const saved = await updateProspectusPdfTable(id!, tableId, {
        rows: table.rows,
        columns: table.columns,
        label: table.label ?? null,
        region_page_index: table.regionPageIndex,
        region_x_start_pt: Number(table.regionXStartPt),
        region_x_end_pt: Number(table.regionXEndPt),
        region_y_start_pt: Number(table.regionYStartPt),
        region_y_end_pt: Number(table.regionYEndPt),
      });

      // Use the response to update the cached PDF directly. Refetching the
      // whole record here made Save wait on every table's JSONB rows.
      qc.setQueryData<ProspectusPdf | undefined>(
        ['prospectus-pdf', id],
        (prev) =>
          prev
            ? {
                ...prev,
                tables: (prev.tables ?? []).map((cached) =>
                  cached.tableId === tableId ? saved : cached,
                ),
              }
            : prev,
      );

      setEditing({ kind: 'none' });
      setSelection({ kind: 'none' });
      setDirtyTableIds((prev) => {
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
      // Per-PDF counts on the list page change when rows are saved.
      void qc.invalidateQueries({ queryKey: ['prospectus-pdfs'] });
    } catch (err) {
      console.error(err);
      alert('Failed to save table');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelTable = (tableId: string) => {
    const original = initialTables.find((t) => t.tableId === tableId);
    if (original) {
      upsertTable(original);
    }
    setEditing({ kind: 'none' });
    setSelection({ kind: 'none' });
    setDirtyTableIds(prev => {
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });
  };

  const confirmDeleteTable = useCallback(async () => {
    const tableId = deleteTableId;
    if (!tableId || !id) return;

    // Close the dialog and drop the table locally right away. The request
    // below only persists the deletion; the editor stays responsive even
    // when the API round trip is slow.
    setDeleteTableId(null);
    removeTable(tableId);
    // A deleted table cannot be saved later, so drop it from the dirty set.
    // Otherwise the unsaved-changes prompt would fire for a table that no
    // longer exists.
    setDirtyTableIds((prev) => {
      if (!prev.has(tableId)) return prev;
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });
    qc.setQueryData<ProspectusPdf | undefined>(
      ['prospectus-pdf', id],
      (prev) =>
        prev
          ? {
              ...prev,
              tables: (prev.tables ?? []).filter(
                (table) => table.tableId !== tableId,
              ),
            }
          : prev,
    );

    try {
      await deleteProspectusPdfTable(id, tableId);
      // The list page shows per-PDF table counts; refresh it in the
      // background without blocking the editor.
      void qc.invalidateQueries({ queryKey: ['prospectus-pdfs'] });
    } catch (err) {
      console.error('Failed to delete table', err);
      // The server still owns the table, so pull the authoritative state
      // back into the editor.
      void qc.invalidateQueries({ queryKey: ['prospectus-pdf', id] });
      alert('Failed to delete table');
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
    // Deleting the row that is currently being edited must also end that
    // edit session; otherwise the stale row target keeps Add Table locked.
    if (
      editing.kind === 'row' &&
      editing.tableId === tableId &&
      editing.rowId === rowId
    ) {
      setEditing({ kind: 'none' });
    }
    if (
      selection.kind === 'row' &&
      selection.tableId === tableId &&
      selection.rowId === rowId
    ) {
      setSelection({ kind: 'none' });
    }
    markDirty(tableId);
  }, [
    deleteRowTarget,
    editing,
    selection,
    setEditing,
    setRows,
    setSelection,
    tables,
  ]);

  const handleCanvasRendered = useCallback(
    (dims: { width: number; height: number }) => setRenderedDims(dims),
    [],
  );

  const { rows: selectedExtractedRows } = useExtractedTableData(
    selectedTable,
    selectedTable ? textItemsForTable(selectedTable) : null,
  );

  // ── Sorted tables for quick-nav ──
  const sortedTablesForNav = useMemo(
    () =>
      [...tables].sort((a, b) => {
        const aElective = (a.tableKind ?? 'regular') === 'elective';
        const bElective = (b.tableKind ?? 'regular') === 'elective';
        if (aElective !== bElective) return aElective ? 1 : -1;
        const aYear = a.yearLevel ?? 99;
        const bYear = b.yearLevel ?? 99;
        if (aYear !== bYear) return aYear - bYear;
        return (
          (a.semester ? SEMESTER_ORDER[a.semester] ?? 9 : 9) -
          (b.semester ? SEMESTER_ORDER[b.semester] ?? 9 : 9)
        );
      }),
    [tables],
  );

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
            onClick={() => attemptNavigate('/import')}
            className="text-xs text-on-surface-variant hover:text-primary flex items-center gap-1 mb-1"
          >
            <Icon name="arrow_back" size={14} />
            Back to Import
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-on-surface truncate">
              {pdfRecord.originalFilename}
            </h1>
          </div>
          <p className="text-on-surface-variant text-xs mt-0.5">
            {pdfRecord.pageCount} page
            {pdfRecord.pageCount === 1 ? '' : 's'} ·{' '}
            {tables.length} of {MAX_TABLES} tables mapped
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHowToOpen(true)}
            className="p-2 rounded-lg border border-surface-variant hover:bg-surface-container-low transition"
            title="How to use this editor"
            aria-label="Help"
          >
            <Icon name="help" size={16} />
          </button>

          <button
            onClick={() => setDrawingMode({ kind: 'focusing' })}
            disabled={drawingMode.kind !== 'idle'}
            className="px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold hover:bg-surface-container-low transition disabled:opacity-50 flex items-center gap-1.5"
            title="Draw a rectangle to zoom (or press F)"
          >
            <Icon name="center_focus_strong" size={16} />
            Focus
          </button>

          <button
            onClick={() => setAutoDetectOpen(true)}
            disabled={drawingMode.kind !== 'idle' || editingLocked}
            className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition disabled:opacity-50 flex items-center gap-1.5"
            title={
              editingLocked
                ? 'Save or cancel the table you are editing first'
                : 'Let the parser find tables, columns, and rows automatically'
            }
          >
            <Icon name="auto_awesome" size={16} />
            Auto-detect
          </button>

          <button
            onClick={() => setAddTableOpen(true)}
            disabled={drawingMode.kind !== 'idle' || editingLocked}
            className="px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold hover:bg-surface-container-low transition disabled:opacity-50 flex items-center gap-1.5"
            title={
              editingLocked
                ? 'Save or cancel the table you are editing first'
                : undefined
            }
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

      {/* Create/update errors — these used to only reach the console, so a
          blocked "Add Table" looked like nothing happened. */}
      {tableError && (
        <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 text-sm flex items-start gap-2">
          <Icon name="error" size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">{tableError}</div>
          <button
            type="button"
            onClick={() => setTableError(null)}
            className="px-2 py-0.5 rounded text-xs font-semibold bg-white/70 hover:bg-white transition"
          >
            Dismiss
          </button>
        </div>
      )}

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
                  {drawingMode.tableKind === 'elective'
                    ? 'elective table (any year / term)'
                    : `${yearTermLabel(
                        drawingMode.yearLevel,
                        drawingMode.semester,
                      )} table`}
                </strong>
                . Rows will be created automatically from the PDF text
                lines. Press{' '}
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white/60 rounded">
                  Esc
                </kbd>{' '}
                to cancel.
              </>
            )}
            {drawingMode.kind === 'focusing' && (
              <>
                Drag a rectangle to <strong>zoom into that area</strong>. Press{' '}
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white/60 rounded">
                  Esc
                </kbd>{' '}
                to cancel.
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

      {/* Image-only page warning */}
      {textLayer && !textLayer.hasText && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-2">
          <Icon name="warning" size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong>Page {pageIndex + 1} has no selectable text.</strong> It is
            most likely a scanned page or an image pasted into a document (for
            example a screenshot inside a Word file exported to PDF). The live
            preview can't read it — use <strong>Import → Read with OCR</strong>{' '}
            to extract it from the page image instead.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-surface-variant bg-surface-container-lowest flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
            className="p-2 rounded hover:bg-surface-container-high disabled:opacity-30"
            title="Previous page (←)"
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
            title="Next page (→)"
          >
            <Icon name="chevron_right" size={18} />
          </button>
        </div>

        <div className="h-5 w-px bg-surface-variant" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
            className="p-2 rounded hover:bg-surface-container-high"
            title="Zoom out (-)"
          >
            <Icon name="zoom_out" size={18} />
          </button>
          <span className="text-xs font-mono w-14 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
            className="p-2 rounded hover:bg-surface-container-high"
            title="Zoom in (+)"
          >
            <Icon name="zoom_in" size={18} />
          </button>
          <div className="h-5 w-px bg-surface-variant mx-1" />
          <button
            onClick={fitPageToContainer}
            className="p-2 rounded hover:bg-surface-container-high"
            title="Fit page to screen (F)"
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
            title="Reset to 100% (0)"
          >
            <Icon name="restart_alt" size={18} />
          </button>
        </div>

        <div className="ml-auto text-[10px] text-on-surface-variant hidden lg:flex items-center gap-3">
          <span>
            <kbd className="px-1 py-0.5 font-mono border border-surface-variant rounded bg-surface-container-low">
              ←→
            </kbd>{' '}
            pages
          </span>
          <span>
            <kbd className="px-1 py-0.5 font-mono border border-surface-variant rounded bg-surface-container-low">
              +/-
            </kbd>{' '}
            zoom
          </span>
          <span>
            <kbd className="px-1 py-0.5 font-mono border border-surface-variant rounded bg-surface-container-low">
              Ctrl
            </kbd>
            {' + '}
            wheel
          </span>
        </div>
      </div>

      {/* Canvas + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 lg:items-start">
        <div
          ref={canvasScrollRef}
          className={`rounded-lg border border-surface-variant bg-surface-container-low overflow-auto p-4 md:p-6 min-h-[600px] lg:h-[calc(100dvh-15rem)] lg:min-h-[420px] ${cursorClass}`}
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
                    onSaveTable={handleSaveTable}
                    onCancelTable={handleCancelTable}
                    isSaving={isSaving}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — sticky on desktop so the live extraction stays in view
            while the canvas scrolls. Top offset clears the sticky TopBar. */}
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          {/* Table quick-nav */}
          {sortedTablesForNav.length > 0 && (
            <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-on-surface">
                  Mapped tables
                </div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  {sortedTablesForNav.length}/{MAX_TABLES}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {sortedTablesForNav.map((t) => {
                  const active =
                    selection.kind !== 'none' &&
                    selection.tableId === t.tableId;
                  return (
                    <button
                      key={t.tableId}
                      onClick={() => {
                        setPageIndex(t.regionPageIndex);
                        setSelection({
                          kind: 'table',
                          tableId: t.tableId,
                        });
                        const rect = {
                          x_start_pt: Number(t.regionXStartPt),
                          x_end_pt: Number(t.regionXEndPt),
                          y_start_pt: Number(t.regionYStartPt),
                          y_end_pt: Number(t.regionYEndPt),
                        };
                        setTimeout(() => focusOnRect(rect), 80);
                      }}
                      className={`text-left px-2 py-1.5 rounded border text-[11px] transition ${
                        active
                          ? 'border-primary bg-primary/10 text-primary font-semibold'
                          : 'border-surface-variant hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1 flex-wrap">
                        {shortTableLabel(t)}
                      </div>
                      <div className="text-[10px] opacity-70">
                        p.{t.regionPageIndex + 1} · {t.rows.length} row
                        {t.rows.length === 1 ? '' : 's'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedTable && (selectedTable.tableKind ?? 'regular') === 'elective' && (
            <TableNameEditor
              key={selectedTable.tableId}
              table={selectedTable}
              disabled={isSaving}
              suggestedName={selectedTableHeading}
              onChange={(label) =>
                handleLabelChange(selectedTable.tableId, label)
              }
            />
          )}

          {selectedTable && (selectedTable.tableKind ?? 'regular') === 'elective' && (
            <ElectiveColumnsEditor
              table={selectedTable}
              disabled={isSaving}
              onChange={(columns) =>
                handleColumnsChange(selectedTable.tableId, columns)
              }
              onDetect={() => handleRedetectColumns(selectedTable.tableId)}
            />
          )}

          <LiveExtractionPreview
            table={selectedTable}
            textItems={
              selectedTable ? textItemsForTable(selectedTable) : null
            }
            onExpand={
              selectedTable ? () => setTableModalOpen(true) : undefined
            }
          />

          {selectedTable && (
            <TableRowsEditor
              table={selectedTable}
              extractedRows={selectedExtractedRows}
              selectedRowId={
                selection.kind === 'row' ? selection.rowId : null
              }
              disabled={isSaving}
              onSelectRow={(rowId) =>
                handleRowSelectAndFocus(selectedTable.tableId, rowId)
              }
              onAddRow={() => handleAddRow(selectedTable.tableId)}
              onAddAbove={(rowId) =>
                handleAddRowAt(selectedTable.tableId, rowId, 'above')
              }
              onAddBelow={(rowId) =>
                handleAddRowAt(selectedTable.tableId, rowId, 'below')
              }
              onDuplicate={(rowId) =>
                handleDuplicateRow(selectedTable.tableId, rowId)
              }
              onMove={(rowId, direction) =>
                handleMoveRow(selectedTable.tableId, rowId, direction)
              }
              onDelete={(rowId) =>
                setDeleteRowTarget({
                  tableId: selectedTable.tableId,
                  rowId,
                })
              }
              onCellChange={(rowId, role, value) =>
                handleRowCellChange(
                  selectedTable.tableId,
                  rowId,
                  role,
                  value,
                )
              }
            />
          )}
        </div>
      </div>

      {/* Full-table view — opened by clicking the live preview */}
      <ExtractedTableModal
        open={tableModalOpen}
        onClose={() => setTableModalOpen(false)}
        table={selectedTable}
        textItems={selectedTable ? textItemsForTable(selectedTable) : null}
      />

      {/* How-to modal */}
      <Modal
        open={howToOpen}
        onClose={() => setHowToOpen(false)}
        title="How to use this editor"
        size="md"
        footer={
          <button
            onClick={() => setHowToOpen(false)}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:opacity-90 transition"
          >
            Got it
          </button>
        }
      >
        <ol className="list-decimal list-inside space-y-2 text-sm text-on-surface-variant">
          <li>
            Click <strong className="text-on-surface">Auto-detect</strong> to
            let the parser find every course table. Review the year/semester it
            inferred, untick anything wrong, then create.
          </li>
          <li>
            Or click <strong className="text-on-surface">Add Table</strong> →
            pick the table type (regular tables need a year and semester;
            electives are not tied to a year/term), then drag a rectangle over
            that table in the PDF. Rows are created from every text line in the
            region. One regular table is allowed per year/semester, up to{' '}
            {MAX_TABLES} tables in total.
          </li>
          <li>
            Select a table to open its{' '}
            <strong className="text-on-surface">Rows</strong> panel in the
            sidebar.
          </li>
          <li>
            In that panel you can add a row, insert <strong>+ Above</strong> /{' '}
            <strong>+ Below</strong>, <strong>Copy row</strong> (keeps the
            extracted text), move a row up/down, or delete it.
          </li>
          <li>
            Click a row to edit its cells directly. Edited cells show a small
            pencil and override the PDF text until you clear them.
          </li>
          <li>
            Click the region's{' '}
            <strong className="text-on-surface">label chip</strong> ("Year X ·
            Sem") to edit the region bounds, and drag the color-coded column
            handles to align the columns.
          </li>
          <li>
            Click <strong className="text-on-surface">Focus</strong> and drag
            over an area to zoom into it.
          </li>
          <li>
            Press <kbd className="px-1 py-0.5 text-xs font-mono border border-surface-variant rounded bg-surface-container-low">Esc</kbd>{' '}
            at any time to cancel a draw in progress.
          </li>
          <li>
            When you're done editing a table, click{' '}
            <strong className="text-on-surface">Save</strong> below the table.
          </li>
        </ol>
      </Modal>

      <AutoDetectDialog
        open={autoDetectOpen}
        onClose={() => setAutoDetectOpen(false)}
        pdfId={id!}
        existingTables={tables}
        onCreated={handleAutoDetected}
      />

      <AddTableDialog
        open={addTableOpen}
        onClose={() => setAddTableOpen(false)}
        existingTables={tables}
        onConfirm={(yearLevel, semester, tableKind, label) => {
          setAddTableOpen(false);
          setDrawingMode({
            kind: 'drawing-region',
            yearLevel,
            semester,
            tableKind,
            label,
          });
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteTable}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition rounded-lg"
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteRow}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition rounded-lg"
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
        pdf={pdf}
      />

      {/* Unsaved Changes Blocker Modal */}
      <Modal
        open={!!pendingNavigation}
        onClose={() => setPendingNavigation(null)}
        title="Unsaved changes"
        size="md"
        footer={
          <>
            <button
              onClick={() => setPendingNavigation(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleDiscardAndLeave}
              className="px-4 py-2 text-sm font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition rounded-lg"
            >
              Discard Changes
            </button>
            <button
              onClick={handleSaveAndLeave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving && (
                <Icon name="progress_activity" size={14} className="animate-spin" />
              )}
              {isSaving ? 'Saving…' : 'Save and Leave'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Icon name="warning" size={24} className="text-amber-600 shrink-0" />
            <p className="text-sm text-slate-700">
              You have unsaved changes in {dirtyTableIds.size} table
              {dirtyTableIds.size === 1 ? '' : 's'}.
            </p>
          </div>
          <p className="text-sm text-slate-600 pl-9">
            Do you want to save them before leaving? If you discard, your recent
            adjustments to rows, columns, and region bounds will be lost.
          </p>
        </div>
      </Modal>
    </div>
  );
}