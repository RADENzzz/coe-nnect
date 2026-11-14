export type ColumnRole =
  | 'code'
  | 'title'
  | 'prereq'
  | 'lec'
  | 'lab'
  | 'total';

export type SemesterType = '1st' | '2nd' | 'summer';

/** Regular curriculum tables are unique per year/semester; electives may repeat. */
export type TableKind = 'regular' | 'elective';

/** Electives may store only a total, with no lecture/lab split. */
export type UnitsMode = 'lec_lab' | 'total_only';

export interface ColumnSlice {
  role: ColumnRole;
  x_start_pt: number;
  x_end_pt: number;
}

export interface RowBox {
  row_id: string;
  y_top_pt: number;
  y_bottom_pt: number;
  /**
   * Optional per-cell overrides. When a role is present its text wins over
   * whatever the PDF text layer contains at that geometry. This is what makes
   * "duplicate row" and direct cell editing possible without a migration:
   * rows are stored as JSONB, so the extra key rides along.
   */
  cells?: Partial<Record<ColumnRole, string>>;
  /**
   * Explicitly empty row, created with "Add row". Unlike an empty `cells`
   * object, this means the row must never read the PDF text underneath it.
   */
  blank?: boolean;
  /**
   * Roles that were empty when the row geometry was pinned. Keeps a row from
   * picking up a neighbouring row's text after it is shifted or resized.
   */
  pinned_empty?: ColumnRole[];
}

/** A table the parser found on its own, before it is committed. */
export interface DetectedTableProposal {
  proposalId: string;
  pageIndex: number;
  yearLevel: number | null;
  semester: SemesterType | null;
  confidence: number;
  label: string;
  headerText: string;
  signals: string[];
  regionXStartPt: number;
  regionXEndPt: number;
  regionYStartPt: number;
  regionYEndPt: number;
  columns: ColumnSlice[];
  rows: RowBox[];
  /** `new` can be created; `conflict` collides with a mapped (year, sem). */
  status: 'new' | 'conflict';
  existingTableId: string | null;
}

export interface DetectTablesResponse {
  pageCount: number;
  proposals: DetectedTableProposal[];
  warnings: string[];
}

export interface ProspectusPdfTable {
  tableId: string;
  pdfId: string;
  /** Null for elective tables that are not tied to a year/term. */
  yearLevel: number | null;
  semester: SemesterType | null;
  label: string | null;
  tableKind: TableKind;
  regionPageIndex: number;
  regionXStartPt: string;
  regionXEndPt: string;
  regionYStartPt: string;
  regionYEndPt: string;
  columns: ColumnSlice[];
  rows: RowBox[];
  subjectCount: number;
  totalLecUnits: number;
  totalLabUnits: number;
  totalUnits: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProspectusPdf {
  pdfId: string;
  departmentId: string;
  originalFilename: string;
  storagePath: string;
  storageBucket: string;
  fileSizeBytes: string;
  pageCount: number;
  pageWidthPt: string;
  pageHeightPt: string;
  notes: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
  updatedAt: string;
  deletedAt: string | null;
  tables?: ProspectusPdfTable[];
}

export interface ParserSubject {
  code: string;
  title: string;
  prereq: string;
  lec: string;
  lab: string;
  total: string;
}

export interface ExtractResponse {
  regions: { table_id: string; subjects: ParserSubject[] }[];
  warnings: string[];
}

export interface SignedUrlResponse {
  signedUrl: string;
  expiresAt: string;
}

/** What mode the mapping overlay is in. */
export type DrawingMode =
  | { kind: 'idle' }
  | {
      kind: 'drawing-region';
      /** Null for elective tables, which are not year/term specific. */
      yearLevel: number | null;
      semester: SemesterType | null;
      tableKind: TableKind;
    }
  | { kind: 'focusing' };

/**
 * A request to zoom/scroll the canvas to a specific PDF-space rectangle.
 * The editor consumes this, applies the zoom, then clears it.
 */
export interface FocusRequest {
  requestId: string;
  x_start_pt: number;
  x_end_pt: number;
  y_start_pt: number;
  y_end_pt: number;
}

/**
 * A transient rectangle being drawn on the canvas, in screen coordinates.
 * Cleared on mouseup.
 */
export interface DraftRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** What is selected in the editor. */
export type Selection =
  | { kind: 'none' }
  | { kind: 'table'; tableId: string }
  | { kind: 'row'; tableId: string; rowId: string };

/**
 * What is currently unlocked for editing. Only one thing at a time.
 * - null: everything locked, clicks only select
 * - 'table': the region is movable/resizable
 * - 'row': the row is movable/resizable
 */
export type EditingTarget =
  | { kind: 'none' }
  | { kind: 'table'; tableId: string }
  | { kind: 'row'; tableId: string; rowId: string };

export const COLUMN_COLORS: Record<ColumnRole, string> = {
  code: '#3B82F6',
  title: '#10B981',
  prereq: '#F59E0B',
  lec: '#8B5CF6',
  lab: '#EC4899',
  total: '#06B6D4',
};

export const COLUMN_LABELS: Record<ColumnRole, string> = {
  code: 'Code',
  title: 'Title',
  prereq: 'Prereq',
  lec: 'Lec',
  lab: 'Lab',
  total: 'Total',
};

export const COLUMN_ORDER: ColumnRole[] = [
  'code',
  'title',
  'prereq',
  'lec',
  'lab',
  'total',
];

export interface SynthesizedCode {
  subjectCode: string;
  title: string;
  yearLevel: number;
  semester: string;
  origin: 'explicit' | 'synthesized' | 'loose';
}

export interface SkippedRow {
  tableId: string;
  rowIndex: number;
  code: string;
  title: string;
  reason:
    | 'no_code'
    | 'no_title'
    | 'unit_mismatch'
    | 'user_skip'
    | 'pattern_mismatch'
    | 'not_elective'
    | 'unknown_subject';
}

export interface SlotCreated {
  subjectId: string;
  subjectCode: string;
  slotLabel: string;
  title: string;
  yearLevel: number | null;
  semester: SemesterType | null;
  isElective: boolean;
  isPlaceholder: boolean;
  unitsMode: UnitsMode;
}

/** Elective rows imported with a deterministic, unresolved temporary code. */
export interface TemporaryCode {
  subjectId: string;
  subjectCode: string;
  title: string;
  yearLevel: number | null;
  semester: SemesterType | null;
}

export interface ImportResult {
  subjectsCreated: number;
  subjectsExisting: number;
  slotsCreated: number;
  prospectusCreated: number;
  prospectusSkipped: number;
  rowsSkipped: number;
  byTable: {
    table_id: string;
    subject_count: number;
    created: number;
    slots: number;
    skipped: number;
    existing: number;
  }[];
  warnings: string[];
  skippedRows: SkippedRow[];
  slots: SlotCreated[];
  temporaryCodes: TemporaryCode[];
}

export interface ProgramOption {
  programId: string;
  programCode: string;
  programName: string;
  deptId: string;
}