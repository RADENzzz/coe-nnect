import type { ColumnSlice, RowBox } from '../types';
import type { TextItem } from '../hooks/usePdfTextLayer';
import { makeRowId, sortRowsTopDown } from './rows';

/**
 * One text line found inside a drawn table region.
 *
 * PDF text items are positioned by their baseline, so two items belong to the
 * same line when their baselines are close. Row bands are then built around
 * those baselines instead of guessing a fixed height.
 */
export interface DetectedTextLine {
  /** Baseline y in PDF points. */
  y: number;
  /** Approximate font height in PDF points. */
  height: number;
  text: string;
  kind: 'data' | 'header' | 'heading';
  /**
   * True when this line begins a new subject row (it carries units or a
   * course code). Wrapped title/description lines are continuations of the
   * row above and must not become rows of their own.
   */
  isRowStart: boolean;
}

const HEADER_ROLE_TOKENS: Record<string, string[]> = {
  code: ['code', 'crs', 'coursecode', 'subjectcode'],
  title: ['title', 'descriptive', 'description', 'coursetitle'],
  prereq: [
    'pre',
    'prereq',
    'prerequisite',
    'prerequisites',
    'requisite',
    'requisites',
  ],
  lec: ['lec', 'lecture', 'lectures', 'theory'],
  lab: ['lab', 'laboratory', 'labs'],
  total: ['total', 'unit', 'units', 'credit', 'credits'],
};

function normaliseToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** How many distinct column roles a line names (for header detection). */
function headerRoleCount(text: string): number {
  const roles = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const token = normaliseToken(raw);
    if (!token) continue;
    for (const [role, words] of Object.entries(HEADER_ROLE_TOKENS)) {
      if (words.includes(token)) roles.add(role);
    }
    if (token.startsWith('prereq')) roles.add('prereq');
  }
  return roles.size;
}

function looksLikeCourseCode(text: string): boolean {
  return /^[A-Z]{2,6}\s*\d{2,4}[A-Z]?\b/.test(text.trim());
}

/**
 * A subject row's units are the trailing numbers on the line (lec, lab,
 * total). Wrapped description lines end with a word, so this is the main
 * text-only signal that separates a new subject from a continuation line.
 *
 * Two trailing numbers are enough on their own. A single trailing number is
 * only trusted when the line also starts with a course code, otherwise a
 * wrapped title such as "Physics 2" would become an extra row.
 */
function endsWithUnits(text: string): boolean {
  const trailing = text.match(
    /((?:\d+(?:[./]\d+)*\s+)*\d+(?:[./]\d+)*)\s*$/,
  );
  if (!trailing) return false;
  const tokens = trailing[1].trim().split(/\s+/);
  const smallUnits = tokens.every((token) => {
    const value = Number(token.split(/[./]/)[0]);
    return Number.isFinite(value) && value <= 20;
  });
  if (!smallUnits) return false;
  return tokens.length >= 2 || looksLikeCourseCode(text);
}

/**
 * Column-aware fallback: when the drawn column slices line up with the PDF,
 * a numeric value in the lec/lab/total columns also marks a subject row.
 * This catches rows whose last token is not the total (e.g. a footnote
 * marker) without turning wrapped title lines into rows.
 */
function lineHasUnitsInColumns(
  items: TextItem[],
  columns: ColumnSlice[] | undefined,
): boolean {
  if (!columns?.length) return false;
  const unitColumns = columns.filter(
    (column) =>
      column.role === 'lec' ||
      column.role === 'lab' ||
      column.role === 'total',
  );
  if (unitColumns.length === 0) return false;

  return items.some((item) => {
    const x = item.transform[4];
    const column = unitColumns.find(
      (candidate) => x >= candidate.x_start_pt && x <= candidate.x_end_pt,
    );
    return column != null && /\d/.test(item.str);
  });
}

/**
 * Section headings such as "FOURTH YEAR" or "2nd Semester" often sit inside
 * a generously drawn region. They are not subject rows, but their baselines
 * still act as a boundary so their text never leaks into the first row.
 *
 * The patterns are anchored to the whole line: a subject titled
 * "Fourth Year Seminar" must stay a data row, not become a heading.
 */
function isSectionHeading(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 7 || looksLikeCourseCode(trimmed)) {
    return false;
  }

  // Normalise punctuation so "FOURTH YEAR - 1ST SEMESTER" and
  // "First Year (First Semester)" both become space-separated words.
  const normalised = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const yearWord = 'first|second|third|fourth|fifth|sixth';
  const yearNum = '[1-6](?:st|nd|rd|th)?';
  const semesterWord = 'first|second|1st|2nd|summer|midyear|mid year';
  const semesterSuffix = `(?:\\s+(?:${semesterWord})(?:\\s+(?:semester|sem|term))?)?`;

  return (
    new RegExp(
      `^(?:${yearWord}|${yearNum})\\s+year(?:\\s+level)?${semesterSuffix}$`,
    ).test(normalised) ||
    new RegExp(
      `^year(?:\\s+level)?\\s+(?:${yearWord}|${yearNum})${semesterSuffix}$`,
    ).test(normalised) ||
    new RegExp(`^(?:${semesterWord})\\s+(?:semester|sem|term)$`).test(
      normalised,
    ) ||
    /^(summer|midyear|mid year)$/.test(normalised)
  );
}

/**
 * Group the text layer into distinct baselines inside a PDF-space rectangle.
 *
 * Mirrors the Python parser's line grouping: items whose vertical overlap is
 * at least 45% of their height belong to the same line. `x` is the item's
 * baseline-left, which is exactly what `extractTextInRect` tests, so a line
 * found here is guaranteed to be readable by the extractor.
 *
 * `columns` (when known) lets the detector recognise unit values in the
 * lec/lab/total slices. Lines without units or a course code are treated as
 * wrapped description lines and folded into the row above by
 * `groupTextLines`.
 */
export function detectTextLines(
  items: TextItem[],
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
  columns?: ColumnSlice[],
): DetectedTextLine[] {
  const left = Math.min(xStart, xEnd);
  const right = Math.max(xStart, xEnd);
  const bottom = Math.min(yStart, yEnd);
  const top = Math.max(yStart, yEnd);
  if (right <= left || top <= bottom) return [];

  const lines: { y: number; height: number; items: TextItem[] }[] = [];

  for (const item of items) {
    if (!item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < left || x > right || y < bottom || y > top) continue;

    const height =
      Math.abs(item.height) || Math.abs(item.transform[3]) || 8;
    const tolerance = Math.max(1, height * 0.45);

    const line = lines.find(
      (candidate) => Math.abs(candidate.y - y) <= tolerance,
    );
    if (line) {
      const count = line.items.length;
      line.y = (line.y * count + y) / (count + 1);
      line.height = Math.max(line.height, height);
      line.items.push(item);
    } else {
      lines.push({ y, height, items: [item] });
    }
  }

  lines.sort((a, b) => b.y - a.y);

  return lines.map((line) => {
    const text = [...line.items]
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const kind: DetectedTextLine['kind'] =
      headerRoleCount(text) >= 2
        ? 'header'
        : isSectionHeading(text)
          ? 'heading'
          : 'data';
    // A wrapped title line has no units and no code, so it must stay attached
    // to the subject row above instead of becoming an extra row.
    const isRowStart =
      kind === 'data' &&
      (endsWithUnits(text) ||
        looksLikeCourseCode(text) ||
        lineHasUnitsInColumns(line.items, columns));
    return { y: line.y, height: line.height, text, kind, isRowStart };
  });
}

/** One subject row's text lines, from its first line to the last wrapped line. */
export interface DetectedRowGroup {
  first: DetectedTextLine;
  last: DetectedTextLine;
  /** Upper band boundary (midpoint with the line above, or region top). */
  top: number;
  /** Lower band boundary (midpoint with the line below, or region bottom). */
  bottom: number;
  lines: DetectedTextLine[];
}

/**
 * Group adjacent text lines into subject rows.
 *
 * A line that carries units (or a course code) starts a new row; wrapped
 * description lines below it belong to that same row. Header and section
 * heading lines never start a row, but their baselines still bound the rows
 * around them so their text does not leak into a subject row.
 */
export function groupTextLines(
  lines: DetectedTextLine[],
  regionYStart: number,
  regionYEnd: number,
): DetectedRowGroup[] {
  const top = Math.max(regionYStart, regionYEnd);
  const bottom = Math.min(regionYStart, regionYEnd);
  if (lines.length === 0 || top <= bottom) return [];

  const sorted = [...lines].sort((a, b) => b.y - a.y);
  const groups: DetectedTextLine[][] = [];
  let current: DetectedTextLine[] | null = null;

  const flush = () => {
    if (current?.length) groups.push(current);
    current = null;
  };

  for (const line of sorted) {
    if (line.kind !== 'data') {
      flush();
      continue;
    }
    if (line.isRowStart || current == null) {
      flush();
      current = [line];
    } else {
      current.push(line);
    }
  }
  flush();

  const indexByLine = new Map(
    sorted.map((line, index) => [line, index] as const),
  );
  const result: DetectedRowGroup[] = [];

  for (const groupLines of groups) {
    const first = groupLines[0];
    const last = groupLines[groupLines.length - 1];
    const firstIndex = indexByLine.get(first) ?? 0;
    const lastIndex = indexByLine.get(last) ?? firstIndex;
    const above = sorted[firstIndex - 1];
    const below = sorted[lastIndex + 1];
    const groupTop = above ? (above.y + first.y) / 2 : top;
    const groupBottom = below ? (last.y + below.y) / 2 : bottom;
    const clampedTop = Math.min(top, Math.max(groupBottom, groupTop));
    const clampedBottom = Math.max(bottom, Math.min(clampedTop, groupBottom));
    if (clampedTop - clampedBottom < 0.5) continue;
    result.push({
      first,
      last,
      top: clampedTop,
      bottom: clampedBottom,
      lines: groupLines,
    });
  }

  return result;
}

/**
 * Turn detected text lines into contiguous row bands. Wrapped description
 * lines are folded into the row above instead of getting their own row.
 */
export function rowsFromTextLines(
  lines: DetectedTextLine[],
  regionYStart: number,
  regionYEnd: number,
): RowBox[] {
  return groupTextLines(lines, regionYStart, regionYEnd).map((group) => ({
    row_id: makeRowId(),
    y_top_pt: group.top,
    y_bottom_pt: group.bottom,
  }));
}

/**
 * Height for the next row appended below `rows`, snapped to the next
 * unclaimed subject row. Returns null when the region has no more rows.
 */
export function nextRowHeightBelow(
  lines: DetectedTextLine[],
  rows: RowBox[],
  regionYStart: number,
  regionYEnd: number,
): number | null {
  const top = Math.max(regionYStart, regionYEnd);
  const bottom = Math.min(regionYStart, regionYEnd);
  if (top <= bottom) return null;

  const sortedRows = sortRowsTopDown(rows);
  const lastBottom =
    sortedRows.length > 0
      ? sortedRows[sortedRows.length - 1].y_bottom_pt
      : top;

  const isClaimed = (y: number) =>
    sortedRows.some(
      (row) => y >= row.y_bottom_pt - 0.01 && y <= row.y_top_pt + 0.01,
    );

  const target = groupTextLines(lines, regionYStart, regionYEnd)
    .filter((group) => group.first.y < lastBottom - 0.01)
    .filter((group) => group.first.y > bottom)
    .filter((group) => !isClaimed(group.first.y))
    .sort((a, b) => b.first.y - a.first.y)[0];

  if (!target) return null;
  return Math.max(0.5, lastBottom - target.bottom);
}

/**
 * Height for a row inserted at `sortedIndex`, snapped to the nearest
 * unclaimed subject row below the insertion point. Used by "Add above" and
 * "Add below" so those rows also read the PDF instead of staying blank.
 */
export function insertionRowHeight(
  lines: DetectedTextLine[],
  rows: RowBox[],
  sortedIndex: number,
  regionYStart: number,
  regionYEnd: number,
): number | null {
  const top = Math.max(regionYStart, regionYEnd);
  const bottom = Math.min(regionYStart, regionYEnd);
  if (top <= bottom) return null;

  const sorted = sortRowsTopDown(rows);
  const insertionTop =
    sortedIndex <= 0
      ? sorted[0]?.y_top_pt ?? top
      : sortedIndex >= sorted.length
        ? sorted[sorted.length - 1]?.y_bottom_pt ?? bottom
        : sorted[sortedIndex].y_top_pt;

  const isClaimed = (y: number) =>
    sorted.some(
      (row) => y >= row.y_bottom_pt - 0.01 && y <= row.y_top_pt + 0.01,
    );

  const target = groupTextLines(lines, regionYStart, regionYEnd)
    .filter((group) => group.first.y <= insertionTop + 0.01)
    .filter((group) => group.first.y > bottom)
    .filter((group) => !isClaimed(group.first.y))
    .sort((a, b) => b.first.y - a.first.y)[0];

  if (!target) return null;
  return Math.max(0.5, insertionTop - target.bottom);
}
