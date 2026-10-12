export type ColumnRole =
  | 'code'
  | 'title'
  | 'prereq'
  | 'lec'
  | 'lab'
  | 'total';

export type SemesterType = '1st' | '2nd' | 'summer';

export interface ColumnSlice {
  role: ColumnRole;
  x_start_pt: number;
  x_end_pt: number;
}

export interface RowBox {
  row_id: string;
  y_top_pt: number;
  y_bottom_pt: number;
}

export interface ProspectusPdfTable {
  tableId: string;
  pdfId: string;
  yearLevel: number;
  semester: SemesterType;
  label: string | null;
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
  | { kind: 'drawing-region'; yearLevel: number; semester: SemesterType }
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

export interface ImportResult {
  subjectsCreated: number;
  subjectsExisting: number;
  prospectusCreated: number;
  prospectusSkipped: number;
  skippedRows: number;
  byTable: {
    table_id: string;
    subject_count: number;
    created: number;
    skipped: number;
    existing: number;
  }[];
  warnings: string[];
}

export interface ProgramOption {
  programId: string;
  programCode: string;
  programName: string;
  deptId: string;
}