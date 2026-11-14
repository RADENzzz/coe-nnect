import type { RowBox } from '../types';
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
 */
export function detectTextLines(
  items: TextItem[],
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
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
    return { y: line.y, height: line.height, text, kind };
  });
}

/**
 * Turn detected text lines into contiguous row bands.
 *
 * Boundaries are the midpoints between adjacent baselines (not arbitrary
 * fractions of the region), so every data line's baseline falls inside its
 * own row. Header/heading lines still contribute boundaries but do not get a
 * row of their own.
 */
export function rowsFromTextLines(
  lines: DetectedTextLine[],
  regionYStart: number,
  regionYEnd: number,
): RowBox[] {
  const top = Math.max(regionYStart, regionYEnd);
  const bottom = Math.min(regionYStart, regionYEnd);
  if (lines.length === 0 || top <= bottom) return [];

  const sorted = [...lines].sort((a, b) => b.y - a.y);
  const rows: RowBox[] = [];

  sorted.forEach((line, index) => {
    if (line.kind !== 'data') return;
    const above = sorted[index - 1];
    const below = sorted[index + 1];
    const rowTop = above ? (above.y + line.y) / 2 : top;
    const rowBottom = below ? (line.y + below.y) / 2 : bottom;
    if (rowTop - rowBottom < 0.5) return;
    rows.push({
      row_id: makeRowId(),
      y_top_pt: rowTop,
      y_bottom_pt: rowBottom,
    });
  });

  return rows;
}

/**
 * Height for the next row appended below `rows`, snapped to the next
 * unclaimed text baseline. Returns null when the region has no more text.
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

  const candidates = lines
    .filter((line) => line.kind === 'data')
    .filter((line) => line.y < lastBottom - 0.01)
    .filter((line) => line.y > bottom)
    .filter((line) => !isClaimed(line.y))
    .sort((a, b) => b.y - a.y);

  const target = candidates[0];
  if (!target) return null;

  const nextBelow = lines
    .filter((line) => line.y < target.y - 0.01)
    .sort((a, b) => b.y - a.y)[0];
  const bandBottom = Math.max(
    bottom,
    nextBelow ? (target.y + nextBelow.y) / 2 : bottom,
  );
  return Math.max(0.5, lastBottom - bandBottom);
}

/**
 * Height for a row inserted at `sortedIndex`, snapped to the nearest
 * unclaimed baseline below the insertion point. Used by "Add above" and
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

  const target = lines
    .filter((line) => line.kind === 'data')
    .filter((line) => line.y <= insertionTop + 0.01)
    .filter((line) => line.y > bottom)
    .filter((line) => !isClaimed(line.y))
    .sort((a, b) => b.y - a.y)[0];

  if (!target) return null;

  const nextBelow = lines
    .filter((line) => line.y < target.y - 0.01)
    .sort((a, b) => b.y - a.y)[0];
  const bandBottom = Math.max(
    bottom,
    nextBelow ? (target.y + nextBelow.y) / 2 : bottom,
  );
  return Math.max(0.5, insertionTop - bandBottom);
}
