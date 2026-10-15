import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DrawingMode,
  DraftRect,
  EditingTarget,
  ProspectusPdfTable,
  RowBox,
  Selection,
} from '../types';
import {
  normalizeScreenRect,
  screenRectToPdf,
  type PageView,
} from '../utils/coords';
import TableRegion from './TableRegion';

interface MappingOverlayProps {
  canvasWidth: number;
  canvasHeight: number;
  pageIndex: number;
  pageView: PageView;
  tables: ProspectusPdfTable[];
  selection: Selection;
  editing: EditingTarget;
  drawingMode: DrawingMode;
  onSelect: (s: Selection) => void;
  onEditingChange: (e: EditingTarget) => void;
  onRegionDrawn: (rect: {
    x_start_pt: number;
    x_end_pt: number;
    y_start_pt: number;
    y_end_pt: number;
  }) => void;
  onFocusDrawn: (rect: {
    x_start_pt: number;
    x_end_pt: number;
    y_start_pt: number;
    y_end_pt: number;
  }) => void;
  onTableDelete: (tableId: string) => void;
  onColumnsChange: (
    tableId: string,
    columns: ProspectusPdfTable['columns'],
  ) => void;
  onRegionChange: (
    tableId: string,
    region: {
      xStart: number;
      xEnd: number;
      yStart: number;
      yEnd: number;
    },
  ) => void;
  onRowChange: (tableId: string, rowId: string, next: RowBox) => void;
  onRowDelete: (tableId: string, rowId: string) => void;
  onRowSelect: (tableId: string, rowId: string) => void;
  onAddRow: (tableId: string) => void;
  /** Called when the user cancels an in-progress draw (Escape). */
  onCancelDrawing?: () => void;
}

export default function MappingOverlay({
  canvasWidth,
  canvasHeight,
  pageIndex,
  pageView,
  tables,
  selection,
  editing,
  drawingMode,
  onSelect,
  onEditingChange,
  onRegionDrawn,
  onFocusDrawn,
  onTableDelete,
  onColumnsChange,
  onRegionChange,
  onRowChange,
  onRowDelete,
  onRowSelect,
  onAddRow,
  onCancelDrawing,
}: MappingOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DraftRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const localPoint = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  // ── Escape cancels an in-progress drag ──
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dragStart.current = null;
        setDraft(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [draft]);

  // ── Draft dimensions in PDF points, for the inline label ──
  const draftSizePt = useMemo(() => {
    if (!draft) return null;
    const pdf = screenRectToPdf(draft, pageView);
    const w = pdf.x_end_pt - pdf.x_start_pt;
    const h = pdf.y_end_pt - pdf.y_start_pt;
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return { w, h };
  }, [draft, pageView]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawingMode.kind === 'idle') {
      // Clicking empty canvas deselects AND locks everything
      onSelect({ kind: 'none' });
      onEditingChange({ kind: 'none' });
      return;
    }
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = localPoint(e);
    dragStart.current = p;
    setDraft({ left: p.x, top: p.y, width: 0, height: 0 });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    e.stopPropagation();
    const p = localPoint(e);
    const rect = normalizeScreenRect(
      dragStart.current.x,
      dragStart.current.y,
      p.x,
      p.y,
    );
    setDraft(rect);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !draft) {
      dragStart.current = null;
      setDraft(null);
      return;
    }
    e.stopPropagation();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    // Reject accidental "dot" drags.
    const MIN_DRAW_PX = 12;
    if (draft.width < MIN_DRAW_PX || draft.height < MIN_DRAW_PX) {
      dragStart.current = null;
      setDraft(null);
      return;
    }

    // For region tables specifically, also require a minimum PDF-space
    // area. Otherwise a slight accidental drag creates a "dot table"
    // that's hard to select and delete.
    if (drawingMode.kind === 'drawing-region') {
      const pdfCheck = screenRectToPdf(draft, pageView);
      const wPt = pdfCheck.x_end_pt - pdfCheck.x_start_pt;
      const hPt = pdfCheck.y_end_pt - pdfCheck.y_start_pt;
      if (wPt < 60 || hPt < 40) {
        dragStart.current = null;
        setDraft(null);
        return;
      }
    }

    const pdfRect = screenRectToPdf(draft, pageView);

    if (drawingMode.kind === 'drawing-region') {
      onRegionDrawn(pdfRect);
    } else if (drawingMode.kind === 'focusing') {
      onFocusDrawn(pdfRect);
    }

    dragStart.current = null;
    setDraft(null);
  };

  // Cancel via right-click / context menu (some users find this natural)
  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draft) return;
    e.preventDefault();
    dragStart.current = null;
    setDraft(null);
  };

  const visibleTables = tables.filter(
    (t) => t.regionPageIndex === pageIndex,
  );

  const cursor =
    drawingMode.kind === 'drawing-region' ||
    drawingMode.kind === 'focusing'
      ? 'crosshair'
      : 'default';

  const draftColor =
    drawingMode.kind === 'focusing'
      ? 'border-amber-500 bg-amber-300/20'
      : 'border-primary bg-primary/10';

  const draftHint =
    drawingMode.kind === 'focusing' ? 'Zoom to area' : 'Mark table';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ width: canvasWidth, height: canvasHeight, cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
    >
      {visibleTables.map((table) => (
        <TableRegion
          key={table.tableId}
          table={table}
          pageView={pageView}
          selected={
            selection.kind === 'table' && selection.tableId === table.tableId
          }
          editingRegion={
            editing.kind === 'table' && editing.tableId === table.tableId
          }
          editingRowId={
            editing.kind === 'row' && editing.tableId === table.tableId
              ? editing.rowId
              : null
          }
          selectedRowId={
            selection.kind === 'row' && selection.tableId === table.tableId
              ? selection.rowId
              : null
          }
          onSelect={() => onSelect({ kind: 'table', tableId: table.tableId })}
          onToggleEditRegion={() => {
            if (
              editing.kind === 'table' &&
              editing.tableId === table.tableId
            ) {
              onEditingChange({ kind: 'none' });
            } else {
              onEditingChange({ kind: 'table', tableId: table.tableId });
            }
          }}
          onDelete={() => onTableDelete(table.tableId)}
          onColumnsChange={(next) => onColumnsChange(table.tableId, next)}
          onRegionChange={(next) => onRegionChange(table.tableId, next)}
          onRowChange={(rowId, next) => onRowChange(table.tableId, rowId, next)}
          onRowDelete={(rowId) => onRowDelete(table.tableId, rowId)}
          onRowSelect={(rowId) => onRowSelect(table.tableId, rowId)}
          onRowToggleEdit={(rowId) => {
            if (editing.kind === 'row' && editing.rowId === rowId) {
              onEditingChange({ kind: 'none' });
            } else {
              onEditingChange({
                kind: 'row',
                tableId: table.tableId,
                rowId,
              });
            }
          }}
          onAddRow={() => onAddRow(table.tableId)}
          columnsInteractive={
            selection.kind === 'table' &&
            selection.tableId === table.tableId &&
            drawingMode.kind === 'idle'
          }
        />
      ))}

      {/* Draft rectangle */}
      {draft && (
        <div
          className={`absolute border-2 pointer-events-none flex items-center justify-center ${draftColor}`}
          style={{
            left: draft.left,
            top: draft.top,
            width: draft.width,
            height: draft.height,
            zIndex: 50,
          }}
        >
          {/* Inline dimension label — only when the draft is big enough */}
          {draftSizePt && draft.width > 90 && draft.height > 28 && (
            <div className="px-2 py-1 rounded bg-slate-900/90 text-white text-[10px] font-mono whitespace-nowrap shadow-lg flex items-center gap-1.5">
              <span className="font-bold">{draftHint}</span>
              <span className="opacity-60">·</span>
              <span>
                {draftSizePt.w.toFixed(1)} × {draftSizePt.h.toFixed(1)} pt
              </span>
            </div>
          )}

          {/* Corner hint — visible even on small drafts */}
          {draft.width > 40 && draft.height > 40 && (
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 whitespace-nowrap bg-white/90 px-1.5 py-0.5 rounded shadow-sm">
              Press <kbd className="font-mono">Esc</kbd> to cancel
            </span>
          )}
        </div>
      )}
    </div>
  );
}