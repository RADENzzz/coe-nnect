import type { ColumnRole, ColumnSlice, TableKind } from '../types';
import type { TextItem } from '../hooks/usePdfTextLayer';
import { groupTextItemsByBaseline } from './rowDetection';
import { makeDefaultColumns } from '../hooks/useRegionState';

/**
 * Column auto-detection for a freshly drawn table region.
 *
 * The PDF text layer tells us where each header label sits. We group the text
 * into baselines, find the header line with the most column labels, and use
 * the label positions to build column slices. Elective tables may have fewer
 * than six columns:
 *
 *   Course Code | Course Title | No. Units            (total-only)
 *   Course Code | Course Title | Lec | Lab | Total    (lec + lab)
 *   Course Code | Course Title | Lec                  (all lecture)
 *   Course Code | Course Title | Lab                  (all laboratory)
 *
 * Regular curriculum tables still use the classic six-column layout, so the
 * detector only changes their widths when all six labels are present.
 */

const ROLE_WORDS: Record<ColumnRole, string[]> = {
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

const COLUMN_ROLES: ColumnRole[] = [
  'code',
  'title',
  'prereq',
  'lec',
  'lab',
  'total',
];

interface HeaderWord {
  text: string;
  x0: number;
  x1: number;
  cx: number;
}

interface HeaderAnchor {
  role: ColumnRole;
  /** Centre of the header label in PDF points. */
  x: number;
}

function normaliseToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function roleForToken(token: string): ColumnRole | null {
  const key = normaliseToken(token);
  if (!key) return null;
  for (const role of COLUMN_ROLES) {
    if (ROLE_WORDS[role].includes(key)) return role;
  }
  if (key.startsWith('prereq')) return 'prereq';
  return null;
}

/**
 * Split PDF text items into word boxes.
 *
 * pdf.js often returns a whole label ("Course Code") as one item, so a naive
 * one-item-one-word approach would miss the two-word pair. When an item holds
 * several words we distribute its width across the characters.
 */
function wordsFromItems(items: TextItem[]): HeaderWord[] {
  const words: HeaderWord[] = [];

  for (const item of items) {
    const raw = item.str;
    if (!raw.trim()) continue;

    const x = item.transform[4];
    const height = Math.abs(item.height) || Math.abs(item.transform[3]) || 8;
    const width = Math.abs(item.width) || raw.length * height * 0.5;
    const tokens = raw.split(/\s+/).filter(Boolean);

    if (tokens.length === 1) {
      const text = tokens[0];
      words.push({ text, x0: x, x1: x + width, cx: x + width / 2 });
      continue;
    }

    let searchFrom = 0;
    for (const token of tokens) {
      const index = raw.indexOf(token, searchFrom);
      if (index < 0) continue;
      const start = x + (width * index) / Math.max(1, raw.length);
      const end =
        x + (width * (index + token.length)) / Math.max(1, raw.length);
      words.push({
        text: token,
        x0: start,
        x1: end,
        cx: (start + end) / 2,
      });
      searchFrom = index + token.length;
    }
  }

  return words.sort((a, b) => a.x0 - b.x0);
}

/** Recognise the labels on one header baseline. */
function anchorsFromItems(items: TextItem[]): HeaderAnchor[] {
  const words = wordsFromItems(items);
  const found = new Map<ColumnRole, number[]>();
  const consumed = new Set<number>();

  const add = (role: ColumnRole, x: number) => {
    const list = found.get(role);
    if (list) list.push(x);
    else found.set(role, [x]);
  };

  for (let i = 0; i < words.length; i += 1) {
    if (consumed.has(i)) continue;
    const token = normaliseToken(words[i].text);
    if (!token) continue;

    // Two-word labels: "Course Code", "Course Title", "Pre-requisite".
    if (token === 'course' || token === 'subject') {
      const next = words[i + 1];
      const nextToken = next ? normaliseToken(next.text) : '';
      if (
        next &&
        (nextToken === 'code' || nextToken === 'no' || nextToken === 'number')
      ) {
        add('code', (words[i].cx + next.cx) / 2);
        consumed.add(i);
        consumed.add(i + 1);
        continue;
      }
      if (
        next &&
        (nextToken === 'title' ||
          nextToken === 'description' ||
          nextToken === 'descriptive')
      ) {
        add('title', (words[i].cx + next.cx) / 2);
        consumed.add(i);
        consumed.add(i + 1);
        continue;
      }
    }

    if (token === 'pre') {
      const next = words[i + 1];
      const nextToken = next ? normaliseToken(next.text) : '';
      if (next && nextToken.startsWith('requis')) {
        add('prereq', (words[i].cx + next.cx) / 2);
        consumed.add(i);
        consumed.add(i + 1);
        continue;
      }
    }

    const role = roleForToken(token);
    if (role) add(role, words[i].cx);
  }

  return [...found.entries()].map(([role, xs]) => ({
    role,
    x: xs.reduce((sum, x) => sum + x, 0) / xs.length,
  }));
}

/**
 * Turn header label centres into contiguous column slices.
 *
 * Boundaries sit halfway between adjacent labels. The first slice starts at
 * the region's left edge and the last ends at its right edge, so every value
 * in the table falls inside exactly one column.
 */
function columnsFromAnchors(
  anchors: HeaderAnchor[],
  xStart: number,
  xEnd: number,
): ColumnSlice[] {
  const ordered = [...anchors].sort((a, b) => a.x - b.x);
  if (ordered.length < 2) return [];

  const left = Math.min(xStart, xEnd);
  const right = Math.max(xStart, xEnd);
  const boundaries = [left];
  for (let i = 0; i < ordered.length - 1; i += 1) {
    boundaries.push((ordered[i].x + ordered[i + 1].x) / 2);
  }
  boundaries.push(right);

  const columns: ColumnSlice[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const start = Math.max(left, Math.min(right, boundaries[i]));
    const end = Math.max(left, Math.min(right, boundaries[i + 1]));
    if (end - start < 0.5) return [];
    columns.push({
      role: ordered[i].role,
      x_start_pt: start,
      x_end_pt: end,
    });
  }
  return columns;
}

/**
 * Detect the column layout of a drawn region from its header line(s).
 *
 * Multi-line headers ("Course Code / Course Title / Lec / Lab" above a second
 * line with "Total") are merged when the baselines are close together.
 * Returns the classic six-column layout when nothing usable is found, or when
 * a regular table's header does not name all six roles.
 */
export function detectColumns(
  items: TextItem[],
  rect: {
    x_start_pt: number;
    x_end_pt: number;
    y_start_pt: number;
    y_end_pt: number;
  },
  tableKind: TableKind,
  options: {
    /**
     * When true (region draw), an unreadable header falls back to the classic
     * six-column layout so the table is still created. Re-detecting an
     * existing table passes false: overwriting a working layout with six
     * guessed columns would lose data, so the caller reports the failure.
     */
    fallbackToDefault?: boolean;
  } = {},
): ColumnSlice[] {
  const { fallbackToDefault = true } = options;
  const fallback = fallbackToDefault
    ? makeDefaultColumns(rect.x_start_pt, rect.x_end_pt)
    : [];
  const lines = groupTextItemsByBaseline(
    items,
    rect.x_start_pt,
    rect.x_end_pt,
    rect.y_start_pt,
    rect.y_end_pt,
  );

  const candidates = lines
    .map((line) => ({ line, anchors: anchorsFromItems(line.items) }))
    .filter((candidate) => candidate.anchors.length >= 2);

  // A real header always names the title column. Data rows can contain words
  // such as "Lab" in a subject title, so only title-bearing baselines are
  // allowed to anchor the header cluster.
  const headerCandidates = candidates.filter((candidate) =>
    candidate.anchors.some((anchor) => anchor.role === 'title'),
  );
  if (headerCandidates.length === 0) return fallback;

  // The primary header is the title-bearing baseline that names the most
  // roles. Ties go to the topmost line, which is where a table header
  // normally sits.
  let primary = headerCandidates[0];
  for (const candidate of headerCandidates.slice(1)) {
    if (candidate.anchors.length > primary.anchors.length) {
      primary = candidate;
    }
  }

  const merged = new Map<ColumnRole, number>();
  for (const anchor of primary.anchors) merged.set(anchor.role, anchor.x);

  // Fold in complementary header lines such as a second "Lec / Lab / Total"
  // baseline directly below the course/title labels. Those lines may not name
  // the title themselves, so all multi-label baselines are considered.
  const mergeDistance = Math.max(primary.line.height, 8) * 2.5;
  for (const candidate of candidates) {
    if (candidate === primary) continue;
    if (Math.abs(candidate.line.y - primary.line.y) > mergeDistance) continue;
    for (const anchor of candidate.anchors) {
      if (!merged.has(anchor.role)) merged.set(anchor.role, anchor.x);
    }
  }

  const columns = columnsFromAnchors(
    [...merged.entries()].map(([role, x]) => ({ role, x })),
    rect.x_start_pt,
    rect.x_end_pt,
  );
  if (columns.length === 0) return fallback;

  // Regular curriculum tables keep the fixed six-role contract. Electives are
  // allowed to expose only the roles their PDF actually has.
  if (tableKind === 'regular' && columns.length !== 6) return fallback;

  return columns;
}
