import * as XLSX from 'xlsx';
import type { ScheduleEntry } from '../types';

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

interface ExcelOptions {
  entries: ScheduleEntry[];
  sheetName?: string;
  title: string;
  termLabel: string;
  scopeLabel?: string;
}

/**
 * Generates an .xlsx workbook for the given entries and triggers a download.
 * Layout: title rows at top, then a flat table sorted by Day → Start Time.
 */
export function exportScheduleExcel(opts: ExcelOptions): void {
  const { entries, sheetName = 'Timetable', title, termLabel, scopeLabel } = opts;

  // ── Sort rows: Day order → Start time → Subject ──
  const sorted = [...entries].sort((a, b) => {
    const da = DAY_ORDER.indexOf(a.day);
    const db = DAY_ORDER.indexOf(b.day);
    if (da !== db) return da - db;
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.subjectCode.localeCompare(b.subjectCode);
  });

  // ── Metadata rows ──
  const metaRows = [
    [title],
    ['Western Mindanao State University — College of Engineering'],
    [`Term: ${termLabel}${scopeLabel ? `  ·  Scope: ${scopeLabel}` : ''}`],
    [`Generated: ${new Date().toLocaleString('en-PH')}`],
    [],
  ];

  // ── Table header ──
  const headerRow = [
    'Day',
    'Start',
    'End',
    'Subject Code',
    'Subject Title',
    'Section',
    'Faculty',
    'Room',
    'Type',
    'Status',
  ];

  // ── Data rows ──
  const dataRows = sorted.map((e) => [
    DAY_LABELS[e.day] ?? e.day,
    e.startTime,
    e.endTime,
    e.subjectCode,
    e.subjectTitle || '',
    e.sectionCode || '',
    e.facultyName,
    e.roomNumber,
    e.loadType === 'laboratory' ? 'Laboratory' : 'Lecture',
    e.status ?? 'draft',
  ]);

  const aoa = [...metaRows, headerRow, ...dataRows];

  // ── Build sheet ──
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = [
    { wch: 11 },  // Day
    { wch: 7 },   // Start
    { wch: 7 },   // End
    { wch: 14 },  // Code
    { wch: 32 },  // Title
    { wch: 11 },  // Section
    { wch: 24 },  // Faculty
    { wch: 8 },   // Room
    { wch: 11 },  // Type
    { wch: 10 },  // Status
  ];

  // Merge title rows across all columns
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } },
  ];

  // ── Workbook ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  // ── Filename ──
  const filename = opts.title
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  XLSX.writeFile(wb, `${filename}.xlsx`);
}