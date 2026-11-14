import writeXlsxFile, {
  type Row,
  type SheetData,
} from 'write-excel-file/browser';
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

const COLUMN_COUNT = 10;
const COLUMN_WIDTHS = [11, 7, 7, 14, 32, 11, 24, 8, 11, 10];

interface ExcelOptions {
  entries: ScheduleEntry[];
  sheetName?: string;
  title: string;
  termLabel: string;
  scopeLabel?: string;
}

/** A merged title/meta row spanning the full table width. */
function metaRow(text: string, span = COLUMN_COUNT): Row {
  return [
    { value: text, columnSpan: span },
    ...Array.from({ length: span - 1 }, () => null),
  ];
}

/**
 * Generates an .xlsx workbook for the given entries and triggers a download.
 * Layout: title rows at top, then a flat table sorted by Day → Start Time.
 */
export async function exportScheduleExcel(opts: ExcelOptions): Promise<void> {
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
  const metaRows: SheetData = [
    metaRow(title),
    metaRow('Western Mindanao State University — College of Engineering'),
    metaRow(`Term: ${termLabel}${scopeLabel ? `  ·  Scope: ${scopeLabel}` : ''}`),
    metaRow(`Generated: ${new Date().toLocaleString('en-PH')}`),
    [],
  ];

  // ── Table header ──
  const headerRow: Row = [
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
  ].map((value) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#f1f5f9',
  }));

  // ── Data rows ──
  const dataRows: SheetData = sorted.map((e) => [
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

  const sheetData: SheetData = [...metaRows, headerRow, ...dataRows];

  // ── Filename ──
  const filename = opts.title
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  await writeXlsxFile(sheetData, {
    sheet: sheetName.slice(0, 31),
    columns: COLUMN_WIDTHS.map((width) => ({ width })),
  }).toFile(`${filename}.xlsx`);
}
