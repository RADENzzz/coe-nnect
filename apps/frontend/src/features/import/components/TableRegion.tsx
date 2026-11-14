import type { ProspectusPdfTable, RowBox } from '../types';
import { pdfRectToScreen, type PageView } from '../utils/coords';
import { tableLabel } from '../utils/labels';
import ColumnSlices from './ColumnSlices';
import SubjectRow from './SubjectRow';

interface TableRegionProps {
  table: ProspectusPdfTable;
  pageView: PageView;
  selected: boolean;
  editingRegion: boolean;
  editingRowId: string | null;
  selectedRowId: string | null;
  onSelect: () => void;
  onToggleEditRegion: () => void;
  onDelete: () => void;
  onColumnsChange: (next: ProspectusPdfTable['columns']) => void;
  onRegionChange: (next: {
    xStart: number;
    xEnd: number;
    yStart: number;
    yEnd: number;
  }) => void;
  onRowChange: (rowId: string, next: RowBox) => void;
  onRowDelete: (rowId: string) => void;
  onRowSelect: (rowId: string) => void;
  onRowToggleEdit: (rowId: string) => void;
  columnsInteractive: boolean;
  onAddRow: () => void;
  onSaveTable: () => void;
  onCancelTable: () => void;
  isSaving: boolean;
}

export default function TableRegion({
  table,
  pageView,
  selected,
  editingRegion,
  editingRowId,
  selectedRowId,
  onSelect,
  onToggleEditRegion,
  onDelete,
  onColumnsChange,
  onRegionChange,
  onRowChange,
  onRowDelete,
  onRowSelect,
  onRowToggleEdit,
  columnsInteractive,
  onAddRow,
  onSaveTable,
  onCancelTable,
  isSaving,
}: TableRegionProps) {
  const regionScreen = pdfRectToScreen(
    {
      x_start_pt: Number(table.regionXStartPt),
      x_end_pt: Number(table.regionXEndPt),
      y_start_pt: Number(table.regionYStartPt),
      y_end_pt: Number(table.regionYEndPt),
    },
    pageView,
  );

  const label = tableLabel(table);
  const sortedRows = [...table.rows].sort(
    (a, b) => b.y_top_pt - a.y_top_pt,
  );

  const anchorRow = sortedRows[0] ?? null;
  const anchorScreen = anchorRow
    ? pdfRectToScreen(
        {
          x_start_pt: Number(table.regionXStartPt),
          x_end_pt: Number(table.regionXEndPt),
          y_start_pt: anchorRow.y_bottom_pt,
          y_end_pt: anchorRow.y_top_pt,
        },
        pageView,
      )
    : regionScreen;

  return (
    <>
      {/* Region container */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`
          absolute transition-colors
          ${
            editingRegion
              ? 'border-2 border-primary border-solid bg-primary/10'
              : selected
              ? 'border-2 border-primary border-dashed bg-primary/5'
              : 'border-2 border-dashed border-slate-400 bg-slate-100/30 hover:bg-slate-100/60'
          }
        `}
        style={{
          left: regionScreen.left,
          top: regionScreen.top,
          width: regionScreen.width,
          height: regionScreen.height,
          zIndex: 2,
        }}
      >
        {/* Label chip — clickable to toggle region edit */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onToggleEditRegion();
          }}
          className="absolute -top-7 left-0 text-[11px] font-semibold px-2 py-0.5 rounded-t whitespace-nowrap transition flex items-center gap-1.5"
          style={{
            background: editingRegion
              ? '#5c1219'
              : selected
              ? '#7a1f28'
              : '#475569',
            color: 'white',
          }}
          title={
            editingRegion
              ? 'Editing region (click to lock)'
              : 'Click to edit region position/size'
          }
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 12 }}
          >
            {editingRegion ? 'lock_open' : 'lock'}
          </span>
          {label} · {sortedRows.length} row
          {sortedRows.length === 1 ? '' : 's'}
        </button>

        {/* Floating action bar — Cancel / Add row / Save / Delete */}
        {selected && (
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 whitespace-nowrap"
            style={{ top: 'calc(100% + 6px)', zIndex: 30 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onCancelTable();
              }}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-full bg-white border border-surface-variant text-on-surface text-xs font-semibold shadow-lg hover:bg-surface-container-low transition disabled:opacity-50"
              title="Discard changes to this table"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAddRow();
              }}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold shadow-lg hover:opacity-90 transition flex items-center gap-1 disabled:opacity-50"
              title="Add a row below"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14 }}
              >
                add
              </span>
              Add row
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSaveTable();
              }}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-lg hover:bg-emerald-700 transition flex items-center gap-1 disabled:opacity-50"
              title="Save this table"
            >
              {isSaving ? (
                <span
                  className="material-symbols-outlined animate-spin"
                  style={{ fontSize: 14 }}
                >
                  progress_activity
                </span>
              ) : (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14 }}
                >
                  save
                </span>
              )}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            
            <div className="w-px h-5 bg-surface-variant mx-1" />
            
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete();
              }}
              disabled={isSaving}
              className="px-2.5 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold shadow-lg hover:bg-red-200 transition flex items-center gap-1 disabled:opacity-50"
              title="Delete this table"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14 }}
              >
                delete
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Column slices */}
      {selected && (
        <ColumnSlices
          screenLeft={anchorScreen.left}
          screenTop={anchorScreen.top}
          screenWidth={anchorScreen.width}
          screenHeight={anchorScreen.height}
          zoom={pageView.zoom}
          regionXStart={Number(table.regionXStartPt)}
          regionXEnd={Number(table.regionXEndPt)}
          columns={table.columns}
          onChange={onColumnsChange}
          interactive={columnsInteractive}
          zIndex={20}
        />
      )}

      {/* Rows */}
      {sortedRows.map((row, index) => (
        <SubjectRow
          key={row.row_id}
          row={row}
          rowNumber={index + 1}
          regionScreenLeft={regionScreen.left}
          regionScreenTop={regionScreen.top}
          regionScreenWidth={regionScreen.width}
          regionYStart={Number(table.regionYStartPt)}
          regionYEnd={Number(table.regionYEndPt)}
          zoom={pageView.zoom}
          selected={selectedRowId === row.row_id}
          editing={editingRowId === row.row_id}
          onSelect={() => {
            onSelect();
            onRowSelect(row.row_id);
          }}
          onToggleEdit={() => onRowToggleEdit(row.row_id)}
          onChange={(next) => onRowChange(row.row_id, next)}
          onDelete={() => onRowDelete(row.row_id)}
          zIndex={15}
        />
      ))}
    </>
  );
}