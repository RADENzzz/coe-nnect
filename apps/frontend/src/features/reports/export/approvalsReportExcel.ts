import writeXlsxFile, {
  type Row,
  type SheetData,
} from 'write-excel-file/browser';
import type { FacultyRequest } from '../../../api/faculty-requests.api';

export interface ApprovalsExcelOptions {
  rows: FacultyRequest[];
  deptCode: (id: string) => string;
  deptName: (id: string) => string;
  termLabel: string;
}

const COLUMN_COUNT = 10;
const COLUMN_WIDTHS = [7, 12, 12, 12, 12, 42, 11, 32, 12, 12];

/** A merged title/meta row spanning the full table width. */
function metaRow(text: string, span = COLUMN_COUNT): Row {
  return [
    { value: text, columnSpan: span },
    ...Array.from({ length: span - 1 }, () => null),
  ];
}

export async function exportApprovalsExcel(
  { rows, deptCode, termLabel }: ApprovalsExcelOptions,
  filename: string,
): Promise<void> {
  const generatedAt = new Date().toLocaleString('en-PH');

  const metaRows: SheetData = [
    metaRow('Faculty Requests Report'),
    metaRow('Western Mindanao State University — College of Engineering'),
    metaRow(`Term: ${termLabel}`),
    metaRow(`Generated: ${generatedAt}`),
    [],
  ];

  const counts = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
  };

  const summaryRows: SheetData = [
    metaRow(
      [
        'Summary',
        `Total: ${counts.total}`,
        `Pending: ${counts.pending}`,
        `Approved: ${counts.approved}`,
        `Rejected: ${counts.rejected}`,
        `Cancelled: ${counts.cancelled}`,
      ].join('   ·   '),
      6,
    ),
    [],
  ];

  const headerRow: Row = [
    'ID',
    'Requesting Dept',
    'Target Dept',
    'Faculty ID',
    'Subject ID',
    'Reason',
    'Status',
    'Response Remarks',
    'Created',
    'Responded',
  ].map((value) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#f1f5f9',
  }));

  const fmtDate = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  };

  const dataRows: SheetData = rows.map((r) => [
    `#${r.requestId}`,
    deptCode(r.requestingDeptId),
    deptCode(r.targetDeptId),
    r.facultyId ? `#${r.facultyId}` : 'any available',
    `#${r.subjectId}`,
    r.reason || '',
    r.status,
    r.responseRemarks || '',
    fmtDate(r.createdAt),
    fmtDate(r.respondedAt),
  ]);

  const sheetData: SheetData = [
    ...metaRows,
    ...summaryRows,
    headerRow,
    ...dataRows,
  ];

  const safe = filename
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safeName = safe.endsWith('.xlsx') ? safe : `${safe}.xlsx`;

  await writeXlsxFile(sheetData, {
    sheet: 'Approvals',
    columns: COLUMN_WIDTHS.map((width) => ({ width })),
  }).toFile(safeName);
}
