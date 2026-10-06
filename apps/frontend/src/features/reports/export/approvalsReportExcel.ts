import * as XLSX from 'xlsx';
import type { FacultyRequest } from '../../../api/faculty-requests.api';

export interface ApprovalsExcelOptions {
  rows: FacultyRequest[];
  deptCode: (id: string) => string;
  deptName: (id: string) => string;
  termLabel: string;
}

export function exportApprovalsExcel(
  { rows, deptCode, termLabel }: ApprovalsExcelOptions,
  filename: string,
): void {
  const generatedAt = new Date().toLocaleString('en-PH');

  const metaRows: any[][] = [
    ['Faculty Requests Report'],
    ['Western Mindanao State University — College of Engineering'],
    [`Term: ${termLabel}`],
    [`Generated: ${generatedAt}`],
    [],
  ];

  const counts = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
  };

  const summaryRows: any[][] = [
    [
      'Summary',
      `Total: ${counts.total}`,
      `Pending: ${counts.pending}`,
      `Approved: ${counts.approved}`,
      `Rejected: ${counts.rejected}`,
      `Cancelled: ${counts.cancelled}`,
    ],
    [],
  ];

  const headerRow = [
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
  ];

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

  const dataRows = rows.map((r) => [
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

  const aoa: any[][] = [
    ...metaRows,
    ...summaryRows,
    headerRow,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!cols'] = [
    { wch: 7 },   // ID
    { wch: 12 },  // Requesting Dept
    { wch: 12 },  // Target Dept
    { wch: 12 },  // Faculty ID
    { wch: 12 },  // Subject ID
    { wch: 42 },  // Reason
    { wch: 11 },  // Status
    { wch: 32 },  // Response Remarks
    { wch: 12 },  // Created
    { wch: 12 },  // Responded
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: 5 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Approvals');

  const safe = filename
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safeName = safe.endsWith('.xlsx') ? safe : `${safe}.xlsx`;

  XLSX.writeFile(wb, safeName);
}