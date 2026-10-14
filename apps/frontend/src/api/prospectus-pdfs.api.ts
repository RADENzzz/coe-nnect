import { api } from './client';
import type {
  ColumnSlice,
  ExtractResponse,
  ProspectusPdf,
  ProspectusPdfTable,
  RowBox,
  SemesterType,
  SignedUrlResponse,
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
  year_level: number;
  semester: SemesterType;
  label?: string;
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

// ─────────────── Extract + import ───────────────

export async function extractFromPdf(
  pdfId: string,
  tableIds?: string[],
): Promise<ExtractResponse> {
  const { data } = await api.post(
    `/v1/prospectus-pdfs/${pdfId}/extract`,
    { table_ids: tableIds },
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
    }[];
  }[];
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
  synthesizedCodes: SynthesizedCode[];
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