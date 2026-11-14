import { api } from './client';
import type {
  ColumnSlice,
  DetectTablesResponse,
  ExtractResponse,
  ProspectusPdf,
  ProspectusPdfTable,
  RowBox,
  SemesterType,
  SignedUrlResponse,
  TableKind,
  TemporaryCode,
  UnitsMode,
} from '../features/import/types';

// ─────────────── Upload ───────────────

export async function uploadProspectusPdf(params: {
  file: File;
  departmentId: string;
  notes?: string;
}): Promise<ProspectusPdf> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('departmentId', params.departmentId);
  if (params.notes) formData.append('notes', params.notes);

  const { data } = await api.post('/v1/prospectus-pdfs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ─────────────── PDFs ───────────────

export async function fetchProspectusPdfs(
  departmentId?: string,
): Promise<ProspectusPdf[]> {
  const { data } = await api.get('/v1/prospectus-pdfs', {
    params: departmentId ? { departmentId } : undefined,
  });
  return data;
}

export async function fetchProspectusPdf(
  id: string,
): Promise<ProspectusPdf> {
  const { data } = await api.get(`/v1/prospectus-pdfs/${id}`);
  return data;
}

export async function fetchSignedUrl(
  id: string,
): Promise<SignedUrlResponse> {
  const { data } = await api.get(`/v1/prospectus-pdfs/${id}/signed-url`);
  return data;
}

export async function updateProspectusPdf(
  id: string,
  input: {
    original_filename?: string;
    notes?: string;
    department_id?: number;
  },
): Promise<ProspectusPdf> {
  const { data } = await api.patch(`/v1/prospectus-pdfs/${id}`, input);
  return data;
}

export async function deleteProspectusPdf(id: string): Promise<void> {
  await api.delete(`/v1/prospectus-pdfs/${id}`);
}

// ─────────────── Tables ───────────────

export interface CreateTableInput {
  /** Required for regular tables; omitted/null for elective tables. */
  year_level?: number | null;
  /** Required for regular tables; omitted/null for elective tables. */
  semester?: SemesterType | null;
  label?: string;
  table_kind?: TableKind;
  region_page_index: number;
  region_x_start_pt: number;
  region_x_end_pt: number;
  region_y_start_pt: number;
  region_y_end_pt: number;
  columns: ColumnSlice[];
  rows: RowBox[];
}

export async function createProspectusPdfTable(
  pdfId: string,
  input: CreateTableInput,
): Promise<ProspectusPdfTable> {
  const { data } = await api.post(
    `/v1/prospectus-pdfs/${pdfId}/tables`,
    input,
  );
  return data;
}

export async function updateProspectusPdfTable(
  pdfId: string,
  tableId: string,
  input: Partial<CreateTableInput>,
): Promise<ProspectusPdfTable> {
  const { data } = await api.patch(
    `/v1/prospectus-pdfs/${pdfId}/tables/${tableId}`,
    input,
  );
  return data;
}

export async function deleteProspectusPdfTable(
  pdfId: string,
  tableId: string,
): Promise<void> {
  await api.delete(`/v1/prospectus-pdfs/${pdfId}/tables/${tableId}`);
}

/** Ask the parser to propose tables. Nothing is written by this call. */
export async function detectProspectusPdfTables(
  pdfId: string,
  options: { pageIndices?: number[]; maxTables?: number } = {},
): Promise<DetectTablesResponse> {
  const { data } = await api.post(
    `/v1/prospectus-pdfs/${pdfId}/tables/detect`,
    {
      ...(options.pageIndices ? { page_indices: options.pageIndices } : {}),
      ...(options.maxTables ? { max_tables: options.maxTables } : {}),
    },
    { timeout: 180_000 },
  );
  return data;
}

// ─────────────── Extract + import ───────────────

export async function extractFromPdf(
  pdfId: string,
  tableIds?: string[],
  ocr = false,
): Promise<ExtractResponse> {
  const { data } = await api.post(
    `/v1/prospectus-pdfs/${pdfId}/extract`,
    { table_ids: tableIds, ocr },
    // OCR runs over every page in the request — allow it to finish.
    ocr ? { timeout: 240_000 } : undefined,
  );
  return data;
}

export interface ImportConfirmInput {
  program_id: number;
  table_ids: number[];
  regions: {
    table_id: number;
    subjects: {
      code: string;
      title: string;
      prereq?: string;
      lec?: string;
      lab?: string;
      total?: string;
      action?: 'subject' | 'elective' | 'slot' | 'skip';
      /** Existing elective subject chosen in the review UI. */
      subject_id?: number;
      /** `total_only` keeps lecture/lab at zero (electives only). */
      units_mode?: UnitsMode;
      /** Group for a newly created elective (for example GEC). */
      elective_category?: string;
    }[];
  }[];
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

export interface SynthesizedCode {
  subjectCode: string;
  title: string;
  yearLevel: number;
  semester: string;
  origin: 'explicit' | 'synthesized' | 'loose';
}

export interface ImportConfirmResult {
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


export async function confirmImport(
  pdfId: string,
  input: ImportConfirmInput,
): Promise<ImportConfirmResult> {
  const { data } = await api.post(
    `/v1/prospectus-pdfs/${pdfId}/import`,
    input,
  );
  return data;
}