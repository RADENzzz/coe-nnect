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
 * Year/term headings such as "FOURTH YEAR" or "2nd Semester" often sit inside
 * a generously drawn region. They are not subject rows, but their baselines
 * still act as a boundary so their text never leaks into the first row.
 *
 * The patterns are anchored to the whole line: a subject titled
 * "Fourth Year Seminar" must stay a data row, not become a heading.
 */
function isYearTermHeading(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (
    words.length === 0 ||
    words.length > 10 ||
    looksLikeCourseCode(trimmed)
  ) {
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
 * Elective pools often group rows under an all-caps heading such as
 * "ROBOTICS PROCESS AUTOMATION (RPA)" or "SOFTWARE DEVELOPMENT". Course codes
 * and lines containing digits are excluded so "CPE RPA 1" stays a data row.
 */
function isAllCapsHeading(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (
    words.length < 2 ||
    words.length > 10 ||
    looksLikeCourseCode(trimmed)
  ) {
    return false;
  }
  const hasDigit = /\d/.test(trimmed);
  const hasLowercase = /[a-z]/.test(trimmed);
  return !hasDigit && !hasLowercase;
}

/** Words that only exist to join a column label ("No. Units", "Course Code"). */
const HEADER_CONNECTOR_TOKENS = new Set([
  'no',
  'number',
  'of',
  'per',
  'week',
  'weeks',
  'hr',
  'hrs',
  'hour',
  'hours',
  'course',
  'subject',
]);

/**
 * True when a line is made only of column-label words. This keeps an
 * all-caps header such as "COURSE CODE COURSE TITLE" or "NO. UNITS" from
 * being mistaken for an elective group heading.
 */
function isColumnLabelLine(text: string): boolean {
  const tokens = text
    .split(/\s+/)
    .map(normaliseToken)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  let roleTokens = 0;
  for (const token of tokens) {
    if (HEADER_CONNECTOR_TOKENS.has(token)) continue;
    const isRole = Object.values(HEADER_ROLE_TOKENS).some((words) =>
      words.includes(token),
    );
    if (isRole || token.startsWith('prereq')) {
      roleTokens += 1;
      continue;
    }
    return false;
  }
  return roleTokens >= 1;
}

/** All-caps elective group heading, excluding column labels and year/term. */
export function isElectiveGroupHeading(text: string): boolean {
  return (
    isAllCapsHeading(text) &&
    !isColumnLabelLine(text) &&
    !isYearTermHeading(text)
  );
}

function isSectionHeading(text: string): boolean {
  return isYearTermHeading(text) || isAllCapsHeading(text);
}

/** A baseline inside a PDF-space rectangle, before header/row classification. */
export interface TextBaseline {
  /** Baseline y in PDF points. */
  y: number;
  /** Approximate font height in PDF points. */
  height: number;
  items: TextItem[];
}

/**
 * Group the text layer into distinct baselines inside a PDF-space rectangle.
 *
 * Mirrors the Python parser's line grouping: items whose vertical overlap is
 * at least 45% of their height belong to the same line. `x` is the item's
 * baseline-left, which is exactly what `extractTextInRect` tests, so a line
 * found here is guaranteed to be readable by the extractor.
 *
 * Shared by row detection and column-header detection so both agree on what
 * counts as one header line.
 */
export function groupTextItemsByBaseline(
  items: TextItem[],
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
): TextBaseline[] {
  const left = Math.min(xStart, xEnd);
  const right = Math.max(xStart, xEnd);
  const bottom = Math.min(yStart, yEnd);
  const top = Math.max(yStart, yEnd);
  if (right <= left || top <= bottom) return [];

  const lines: TextBaseline[] = [];

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

  return lines.sort((a, b) => b.y - a.y);
}

/**
 * Group the text layer into distinct baselines inside a PDF-space rectangle.
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
  const lines = groupTextItemsByBaseline(items, xStart, xEnd, yStart, yEnd);

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

/**
 * Find the elective group name printed above a drawn table region.
 *
 * Elective pools group their optioned subjects under an all-caps heading:
 *
 *   Course Code | Course Title | Lec | Lab | Total
 *   ROBOTICS PROCESS AUTOMATION (RPA)
 *   CPE RPA 1   | Robotics ... | 2   | 1   | 3
 *
 * The heading is usually the closest all-caps line above the first subject
 * row. A small amount of space above the region is searched too, because a
 * user may draw only the data rows and leave the heading outside the region.
 * Column labels and year/term headings are ignored, and a table header (when
 * present) keeps a distant page title such as "COLLEGE OF ENGINEERING" from
 * being selected.
 */
export function detectTableName(
  items: TextItem[],
  rect: {
    x_start_pt: number;
    x_end_pt: number;
    y_start_pt: number;
    y_end_pt: number;
  },
  options: { searchAbovePt?: number } = {},
): string | null {
  const left = Math.min(rect.x_start_pt, rect.x_end_pt);
  const right = Math.max(rect.x_start_pt, rect.x_end_pt);
  const bottom = Math.min(rect.y_start_pt, rect.y_end_pt);
  const top = Math.max(rect.y_start_pt, rect.y_end_pt);
  if (right <= left || top <= bottom) return null;

  const regionHeight = top - bottom;
  const searchAbove =
    options.searchAbovePt ??
    Math.max(24, Math.min(72, regionHeight * 0.6));
  const lines = detectTextLines(
    items,
    left,
    right,
    bottom,
    top + searchAbove,
  );
  const inside = lines.filter((line) => line.y >= bottom && line.y <= top);

  const headings = lines.filter(
    (line) =>
      line.kind === 'heading' &&
      line.y <= top + searchAbove + 0.01 &&
      isElectiveGroupHeading(line.text),
  );
  if (headings.length === 0) return null;

  const firstRow = inside.find(
    (line) => line.kind === 'data' && line.isRowStart,
  );
  const headerLines = inside
    .filter((line) => line.kind === 'header')
    .sort((a, b) => b.y - a.y);
  const headerTop = headerLines[0]?.y ?? null;
  const headerBottom = headerLines[headerLines.length - 1]?.y ?? null;

  // A heading may sit below the column header (the common layout) or just
  // above it. Anything higher is a page/degree title, not a group name.
  const candidates = headings.filter((line) => {
    if (headerTop == null || headerBottom == null) return true;
    if (line.y <= headerBottom + 0.01) return true;
    const headerHeight = Math.max(1, headerTop - headerBottom);
    return (
      line.y >= headerTop - 0.01 &&
      line.y - headerTop <= Math.max(18, headerHeight * 2.5)
    );
  });
  if (candidates.length === 0) return null;

  if (firstRow) {
    const above = candidates
      .filter((line) => line.y >= firstRow.y - 0.01)
      .sort((a, b) => a.y - b.y);
    return above.length > 0 ? above[0].text : null;
  }

  const insideHeadings = candidates
    .filter((line) => line.y >= bottom && line.y <= top)
    .sort((a, b) => b.y - a.y);
  if (insideHeadings.length > 0) return insideHeadings[0].text;

  const aboveHeadings = candidates
    .filter((line) => line.y > top)
    .sort((a, b) => a.y - b.y);
  return aboveHeadings.length > 0 ? aboveHeadings[0].text : null;
}
