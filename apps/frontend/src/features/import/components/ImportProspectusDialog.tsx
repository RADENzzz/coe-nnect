import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { confirmImport } from '@/api/prospectus-pdfs.api';
import { fetchSubjects, type SubjectRecord } from '@/api/subjects.api';
import type {
  ProspectusPdfTable,
  SemesterType,
  ImportResult,
  SlotCreated,
  ColumnRole,
  UnitsMode,
} from '../types';
import { extractTextInRect } from '../hooks/useCellExtraction';
import { loadPdfPageText, type TextItem } from '../hooks/usePdfTextLayer';
import { tableLabel, yearTermLabel } from '../utils/labels';

interface ImportProspectusDialogProps {
  open: boolean;
  onClose: () => void;
  pdfId: string;
  tables: ProspectusPdfTable[];
  programs: {
    programId: string;
    programCode: string;
    programName: string;
    deptId: string;
  }[];
  departmentId: string;
  /** Used to load the text layer of each selected table's own page. */
  pdf: PDFDocumentProxy | null;
}

type Step = 'select' | 'review' | 'result';

const SUBJECT_CODE_RE =
  /^[A-Za-z][A-Za-z0-9&.-]{1,11}(?:\s+[A-Za-z0-9&.-]{1,16}){0,4}$/;

const SKIP_REASON_LABELS: Record<string, string> = {
  no_code: 'No course code',
  no_title: 'No title',
  unit_mismatch: 'Units do not add up',
  user_skip: 'Skipped by user',
  pattern_mismatch: 'Code pattern mismatch',
  not_elective: 'Not an elective subject',
  unknown_subject: 'Elective not found',
};

interface ReviewRow {
  key: string;
  tableId: string;
  yearLevel: number | null;
  semester: SemesterType | null;
  isElectiveTable: boolean;
  code: string;
  typedCode: string;
  title: string;
  prereq: string;
  lec: string;
  lab: string;
  total: string;
  status: 'new' | 'exists' | 'invalid';
  action: 'subject' | 'elective' | 'slot' | 'skip';
  /** Existing elective subject chosen for this row. */
  subjectId: string;
  /** Category for a newly created elective (e.g. GEC, Major). */
  electiveCategory: string;
  unitsMode: UnitsMode;
  /** Regular subjects are major unless the reviewer drops them on Minor. */
  isMinor: boolean;
  /** How many identical empty elective fields this row represents. */
  copies: number;
  warning?: string;
  checked: boolean;
}

interface ElectiveGroup {
  label: string;
  items: SubjectRecord[];
}

/**
 * A code-less elective row is an empty prospectus field, not a catalog
 * subject. The head fills it later by choosing an elective or typing a code.
 */
function isEmptyElectiveRow(row: ReviewRow): boolean {
  return (
    (row.action === 'elective' || row.action === 'slot') &&
    !row.subjectId &&
    !(row.typedCode.trim() || row.code.trim())
  );
}

function groupElectives(subjects: SubjectRecord[]): ElectiveGroup[] {
  const groups = new Map<string, SubjectRecord[]>();
  for (const subject of subjects) {
    const parts = [
      subject.electiveCategory?.trim() || 'Uncategorized',
      subject.electiveYearLevel ? `Year ${subject.electiveYearLevel}` : '',
      subject.electiveSemester ? `${subject.electiveSemester} sem` : '',
    ].filter(Boolean);
    const key = parts.join(' · ');
    const list = groups.get(key) ?? [];
    list.push(subject);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }));
}

/**
 * Reject titles that are very likely garbage from the PDF:
 *   - "gg gg", "test test", "abc" (repeated or trivially short)
 *   - "x", "1", "-", "???" (no meaningful text)
 *   - empty
 *
 * Short but legitimate titles/acronyms (PE 1, OJT, NSTP, ROTC) are allowed.
 */
const SHORT_TITLE_ALLOWLIST = new Set([
  'pe',
  'ojt',
  'nstp',
  'rotc',
  'cad',
  'dsp',
  'gym',
]);

function isSuspiciousTitle(title: string): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  const words = t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (
    words.length === 1 &&
    words[0].length < 4 &&
    !SHORT_TITLE_ALLOWLIST.has(words[0])
  ) {
    return true;
  }
  if (words.length >= 2 && new Set(words).size === 1) return true;
  return false;
}

/** Recompute a row's validity after the user changes its action or units mode. */
function deriveRowStatus(
  row: ReviewRow,
  action: ReviewRow['action'],
  unitsMode: UnitsMode,
): Pick<ReviewRow, 'status' | 'warning'> {
  if (!row.title) {
    return { status: 'invalid', warning: 'Missing subject title' };
  }
  const lec = parseUnits(row.lec);
  const lab = parseUnits(row.lab);
  const total = parseUnits(row.total);

  if (action === 'elective' && unitsMode === 'total_only') {
    if (total <= 0) {
      return {
        status: 'invalid',
        warning: 'Total-only elective has no total units',
      };
    }
    return { status: 'new', warning: undefined };
  }
  if (
    (action === 'subject' || action === 'elective') &&
    !unitsEqual(lec + lab, total)
  ) {
    return {
      status: 'invalid',
      warning: `lec+lab≠total (${lec}+${lab}≠${total})`,
    };
  }
  return { status: 'new', warning: undefined };
}

function unitsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export default function ImportProspectusDialog({
  open,
  onClose,
  pdfId,
  tables,
  programs,
  departmentId,
  pdf,
}: ImportProspectusDialogProps) {
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>('select');
  const [programId, setProgramId] = useState<string>('');
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
    new Set(tables.map((t) => t.tableId)),
  );
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState('');
  const [draggedRowKey, setDraggedRowKey] = useState<string | null>(null);
  const [dragZone, setDragZone] = useState<'major' | 'minor' | null>(null);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [classifyGroup, setClassifyGroup] = useState('all');

  const { data: catalogSubjects = [] } = useQuery({
    queryKey: ['subjects', { includeInactive: false }],
    queryFn: () => fetchSubjects(false),
    enabled: open,
  });

  // Placeholders are empty prospectus fields, not catalog electives. They
  // must never appear in the import review's elective picker.
  const electiveSubjects = useMemo(
    () =>
      catalogSubjects.filter(
        (s: SubjectRecord) => s.isElective && !s.isPlaceholder,
      ),
    [catalogSubjects],
  );
  const electiveGroups = useMemo(
    () => groupElectives(electiveSubjects),
    [electiveSubjects],
  );
  const electiveCategorySuggestions = useMemo(
    () =>
      [
        ...new Set(
          electiveSubjects
            .map((s) => s.electiveCategory?.trim())
            .filter((c): c is string => !!c),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [electiveSubjects],
  );

  const visiblePrograms = useMemo(() => {
    if (!programs || programs.length === 0) return [];
    if (!departmentId) return programs;
    return programs.filter(
      (p) => p.deptId != null && String(p.deptId) === String(departmentId),
    );
  }, [programs, departmentId]);

  useEffect(() => {
    if (visiblePrograms.length === 0) return;
    const stillValid = visiblePrograms.some(
      (p) => String(p.programId) === String(programId),
    );
    if (!stillValid) setProgramId(String(visiblePrograms[0].programId));
  }, [visiblePrograms, programId]);

  const toggleTable = (tableId: string) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  };

  // The dialog stays mounted while the editor adds/edits tables. Re-sync the
  // selection whenever it opens so newly created tables are included.
  useEffect(() => {
    if (!open) return;
    setSelectedTableIds(new Set(tables.map((t) => t.tableId)));
  }, [open, tables]);

  // ── Build review rows from each table's own page text layer ──
  const handleExtractLocal = async () => {
    setError(null);
    if (!pdf) {
      setError('The PDF is still loading. Please wait a moment.');
      return;
    }

    const selectedTables = tables.filter((t) =>
      selectedTableIds.has(t.tableId),
    );
    if (selectedTables.length === 0) {
      setError('Select at least one table to import.');
      return;
    }

    setExtracting(true);
    try {
      // A PDF may map tables on several pages. Read each page once and use
      // the text items belonging to the table's own page, not whichever page
      // happens to be open in the editor.
      const pageIndices = [
        ...new Set(selectedTables.map((t) => t.regionPageIndex)),
      ];
      const pageTexts = new Map<number, TextItem[]>();
      await Promise.all(
        pageIndices.map(async (pageIndex) => {
          const data = await loadPdfPageText(pdf, pageIndex);
          pageTexts.set(pageIndex, data.items);
        }),
      );

      const rows: ReviewRow[] = [];
      const newWarnings: string[] = [];

      for (const table of selectedTables) {
        const textItems = pageTexts.get(table.regionPageIndex) ?? [];
        const sortedRows = [...table.rows].sort(
          (a, b) => b.y_top_pt - a.y_top_pt,
        );

        for (const row of sortedRows) {
          // Explicitly blank rows carry no data. Editing any cell clears the
          // marker, so a still-blank row can safely be omitted from review.
          if (row.blank) continue;

          const cells: Record<ColumnRole, string> = {
            code: '',
            title: '',
            prereq: '',
            lec: '',
            lab: '',
            total: '',
          };

          for (const col of table.columns) {
            const override = row.cells?.[col.role];
            if (typeof override === 'string') {
              // An explicit override is authoritative, including an empty
              // string the user typed to clear a cell.
              cells[col.role] = override;
            } else if (row.pinned_empty?.includes(col.role)) {
              cells[col.role] = '';
            } else {
              cells[col.role] = extractTextInRect(
                textItems,
                col.x_start_pt,
                row.y_bottom_pt,
                col.x_end_pt,
                row.y_top_pt,
              );
            }
          }

          const code = cells.code.trim();
          const rawTitle = cells.title.trim();

          // Normalize spacing just like the backend
          const title = rawTitle
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Za-z])([0-9])/g, '$1 $2')
            .replace(/\s+/g, ' ');

          const isElectiveTable = table.tableKind === 'elective';
          const lec = parseUnits(cells.lec);
          const lab = parseUnits(cells.lab);
          const rawTotal = cells.total.trim();
          const parsedTotal = parseUnits(rawTotal);
          // Elective tables may have no total column at all (all-lecture or
          // all-laboratory layouts) or list lec/lab without a total. Derive
          // the total so the review row stays importable.
          const total =
            isElectiveTable && parsedTotal === 0 && lec + lab > 0
              ? lec + lab
              : parsedTotal;
          const totalText = rawTotal || (total > 0 ? String(total) : '');

          const defaultAction: ReviewRow['action'] = isElectiveTable
            ? 'elective'
            : code
              ? 'subject'
              : // A regular table row with no code is an empty elective
                // field the head fills later, not a legacy placeholder.
                'elective';

          // Electives may list only a total. Auto-detect that shape so the
          // lec+lab=total check does not reject a valid total-only row.
          const looksTotalOnly =
            isElectiveTable && lec === 0 && lab === 0 && total > 0;
          const unitsMode: UnitsMode = looksTotalOnly
            ? 'total_only'
            : 'lec_lab';

          let status: ReviewRow['status'] = 'new';
          let warning: string | undefined;

          if (!title) {
            status = 'invalid';
            warning = 'Missing subject title';
          } else if (
            unitsMode !== 'total_only' &&
            !unitsEqual(lec + lab, total)
          ) {
            status = 'invalid';
            warning = `lec+lab≠total (${lec}+${lab}≠${total})`;
          }

          const suspicious = isSuspiciousTitle(title);
          if (suspicious) {
            newWarnings.push(
              `Table ${tableLabel(table)}: suspicious title "${title}" (row ${row.row_id})`,
            );
          }

          rows.push({
            key: `${table.tableId}::${row.row_id}`,
            tableId: table.tableId,
            yearLevel: table.yearLevel,
            semester: table.semester,
            isElectiveTable,
            code,
            typedCode: isElectiveTable ? code : '',
            title,
            prereq: cells.prereq.trim(),
            lec: cells.lec.trim(),
            lab: cells.lab.trim(),
            total: totalText,
            status,
            action: defaultAction,
            subjectId: '',
            electiveCategory: '',
            unitsMode,
            isMinor: false,
            copies: 1,
            warning,
            checked: status === 'new' && !suspicious,
          });
        }
      }

      setReviewRows(rows);
      setWarnings(newWarnings);
      setStep('review');
    } catch (err: any) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not read the PDF text layer.',
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleImport = async () => {
    setError(null);
    setImporting(true);
    try {
      const checkedRows = reviewRows.filter((r) => r.checked && r.action !== 'skip');
      const byTable = new Map<string, ReviewRow[]>();
      for (const row of checkedRows) {
        const list = byTable.get(row.tableId) ?? [];
        list.push(row);
        byTable.set(row.tableId, list);
      }
      const regions = [...byTable.entries()].map(([tableId, rows]) => ({
        table_id: Number(tableId),
        subjects: rows.map((r) => ({
          code:
            r.action === 'subject' || r.action === 'elective'
              ? r.typedCode.trim() || r.code
              : '',
          title: r.title,
          prereq: r.prereq,
          lec: r.lec,
          lab: r.lab,
          total: r.total,
          action: r.action,
          ...(r.action === 'subject' ? { is_minor: r.isMinor } : {}),
          ...(r.action === 'elective' && r.subjectId
            ? { subject_id: Number(r.subjectId) }
            : {}),
          ...(isEmptyElectiveRow(r)
            ? { copies: Math.min(Math.max(r.copies || 1, 1), 20) }
            : {}),
          ...(r.action === 'elective'
            ? {
                units_mode: r.unitsMode,
                ...(r.electiveCategory.trim()
                  ? { elective_category: r.electiveCategory.trim() }
                  : {}),
              }
            : {}),
        })),
      }));

      const res = await confirmImport(pdfId, {
        program_id: Number(programId),
        table_ids: [...byTable.keys()].map(Number),
        regions,
      });
      setResult(res);
      setStep('result');
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['prospectus'] });
      qc.invalidateQueries({ queryKey: ['prospectus-pdf', pdfId] });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (importing) return;
    onClose();
    setTimeout(() => {
      setStep('select');
      setReviewRows([]);
      setWarnings([]);
      setResult(null);
      setError(null);
      setProgramId('');
      setFilter('');
    }, 200);
  };

  // ── Derived stats ──
  const readyCount = reviewRows.filter(
    (r) => r.checked && r.status === 'new' && r.action !== 'skip',
  ).length;
  const invalidCount = reviewRows.filter(
    (r) => r.status === 'invalid',
  ).length;
  const existingCount = reviewRows.filter(
    (r) => r.status === 'exists',
  ).length;
  const slotCount = reviewRows.filter(
    (r) => r.checked && r.action === 'slot',
  ).length;
  const electiveCount = reviewRows.filter(
    (r) => r.checked && r.action === 'elective',
  ).length;
  const emptyFieldCount = reviewRows.filter(
    (r) => r.checked && isEmptyElectiveRow(r),
  ).length;
  const classifiableRows = useMemo(
    () => reviewRows.filter((r) => r.action === 'subject'),
    [reviewRows],
  );
  const majorCount = classifiableRows.filter(
    (r) => r.checked && !r.isMinor,
  ).length;
  const minorCount = classifiableRows.filter(
    (r) => r.checked && r.isMinor,
  ).length;

  /** One tab per year/term in the import so classification stays reviewable. */
  const classifyGroups = useMemo(() => {
    const order: Record<string, number> = { '1st': 1, '2nd': 2, summer: 3 };
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        yearLevel: number | null;
        semester: SemesterType | null;
      }
    >();
    for (const row of classifiableRows) {
      const key = `${row.yearLevel ?? 'any'}-${row.semester ?? 'any'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: yearTermLabel(row.yearLevel, row.semester),
          yearLevel: row.yearLevel,
          semester: row.semester,
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      const yearDelta = (a.yearLevel ?? 99) - (b.yearLevel ?? 99);
      if (yearDelta !== 0) return yearDelta;
      return (
        (order[a.semester ?? ''] ?? 99) - (order[b.semester ?? ''] ?? 99)
      );
    });
  }, [classifiableRows]);

  const classifyRows = useMemo(
    () =>
      classifyGroup === 'all'
        ? classifiableRows
        : classifiableRows.filter(
            (r) =>
              `${r.yearLevel ?? 'any'}-${r.semester ?? 'any'}` === classifyGroup,
          ),
    [classifiableRows, classifyGroup],
  );

  const classifyMajorCount = classifyRows.filter((r) => !r.isMinor).length;
  const classifyMinorCount = classifyRows.filter((r) => r.isMinor).length;
  const selectedElectiveTables = useMemo(
    () =>
      tables.filter(
        (t) => selectedTableIds.has(t.tableId) && t.tableKind === 'elective',
      ),
    [tables, selectedTableIds],
  );

  const filteredReviewRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return reviewRows;
    return reviewRows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.typedCode.toLowerCase().includes(q),
    );
  }, [reviewRows, filter]);

  const rowsByTable = useMemo(() => {
    const m = new Map<string, ReviewRow[]>();
    for (const r of filteredReviewRows) {
      const list = m.get(r.tableId) ?? [];
      list.push(r);
      m.set(r.tableId, list);
    }
    return m;
  }, [filteredReviewRows]);

  const [collapsedTables, setCollapsedTables] = useState<Set<string>>(
    new Set(),
  );

  const toggleTableCollapsed = (tableId: string) => {
    setCollapsedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  };

  const allSelectableChecked = useMemo(() => {
    const selectable = reviewRows.filter((r) => r.status === 'new' && !isSuspiciousTitle(r.title));
    return selectable.length > 0 && selectable.every((r) => r.checked);
  }, [reviewRows]);

  const setAllChecked = (checked: boolean) => {
    setReviewRows((prev) =>
      prev.map((r) =>
        r.status === 'new' && !isSuspiciousTitle(r.title) ? { ...r, checked } : r,
      ),
    );
  };

  const setRowMinor = (key: string, isMinor: boolean) => {
    setReviewRows((prev) =>
      prev.map((r) =>
        r.key === key && r.action === 'subject' ? { ...r, isMinor } : r,
      ),
    );
  };

  /** Set Major/Minor for one year/term group (or every regular row). */
  const setGroupMinor = (groupKey: string, isMinor: boolean) => {
    setReviewRows((prev) =>
      prev.map((r) =>
        r.action === 'subject' &&
        (groupKey === 'all' ||
          `${r.yearLevel ?? 'any'}-${r.semester ?? 'any'}` === groupKey)
          ? { ...r, isMinor }
          : r,
      ),
    );
  };

  const handleDropOnZone = (
    e: DragEvent,
    zone: 'major' | 'minor',
  ) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain') || draggedRowKey;
    if (key) setRowMinor(key, zone === 'minor');
    setDraggedRowKey(null);
    setDragZone(null);
  };

  // The whole row is the drag handle; taps/drags that start on a control are
  // ignored so typing, selecting, and using dropdowns still work normally.
  const handleRowDragStart = (
    e: DragEvent<HTMLTableRowElement>,
    row: ReviewRow,
  ) => {
    if (row.action !== 'subject') {
      e.preventDefault();
      return;
    }
    if ((e.target as HTMLElement).closest('input, select, textarea, button, a')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', row.key);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedRowKey(row.key);
  };

  const handleRowDragEnd = () => {
    setDraggedRowKey(null);
    setDragZone(null);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import from PDF"
      size="lg"
      footer={
        step === 'select' ? (
          <>
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleExtractLocal}
              disabled={
                selectedTableIds.size === 0 ||
                !programId ||
                !pdf ||
                extracting
              }
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {extracting ? (
                <>
                  <Icon
                    name="progress_activity"
                    size={14}
                    className="animate-spin"
                  />
                  Reading…
                </>
              ) : (
                'Read Local Text'
              )}
            </button>
          </>
        ) : step === 'review' ? (
          <>
            <button
              onClick={() => setStep('select')}
              disabled={importing}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={importing || readyCount === 0}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {importing ? 'Importing…' : `Import ${readyCount} row${readyCount === 1 ? '' : 's'}`}
            </button>
          </>
        ) : (
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg"
          >
            Close
          </button>
        )
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {step === 'select' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Target Program
            </label>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {visiblePrograms.map((p) => (
                <option key={p.programId} value={p.programId}>
                  [{p.programCode}] {p.programName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Tables to Import
            </label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto border border-surface-variant rounded-lg p-2">
              {tables.map((t) => (
                <label
                  key={t.tableId}
                  className="flex items-center gap-3 p-2 rounded hover:bg-surface-container-low cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTableIds.has(t.tableId)}
                    onChange={() => toggleTable(t.tableId)}
                    className="w-4 h-4 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold flex items-center gap-1.5 flex-wrap">
                      {tableLabel(t)}
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      {t.rows.length} row{t.rows.length === 1 ? '' : 's'}
                      {(t.tableKind ?? 'regular') === 'elective'
                        ? ` · Elective · ${yearTermLabel(
                            t.yearLevel,
                            t.semester,
                          )}`
                        : ''}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {selectedElectiveTables.length > 0 && electiveSubjects.length === 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <span>
                No elective subjects exist in the catalog yet. Elective rows
                without a typed code become{' '}
                <strong>empty elective fields</strong> in the prospectus and are
                hidden from the Subjects catalog until you fill them there.
              </span>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by code or title…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-surface-container-low border border-surface-variant rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none px-3 py-2 border border-surface-variant rounded-lg hover:bg-surface-container-low">
              <input
                type="checkbox"
                checked={allSelectableChecked}
                onChange={(e) => setAllChecked(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Select all
            </label>
          </div>

          <datalist id="import-elective-categories">
            {electiveCategorySuggestions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>

          {classifiableRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">
                  Separate major from minor
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setClassifyGroup('all');
                    setClassifyOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-primary/40 text-primary hover:bg-primary/5 transition flex items-center gap-1"
                >
                  <Icon name="tune" size={13} />
                  Open classifier
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
              <div
                onDragOver={(e) => {
                  if (!draggedRowKey) return;
                  e.preventDefault();
                  setDragZone('major');
                }}
                onDragLeave={() => setDragZone(null)}
                onDrop={(e) => handleDropOnZone(e, 'major')}
                className={`rounded-lg border-2 border-dashed p-2 flex items-center gap-2 transition ${
                  dragZone === 'major'
                    ? 'border-primary bg-primary/5'
                    : 'border-surface-variant bg-surface-container-lowest'
                }`}
              >
                <Icon name="school" size={18} className="text-primary" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    Major subjects
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    {majorCount} selected · drag a row here
                  </p>
                </div>
              </div>
              <div
                onDragOver={(e) => {
                  if (!draggedRowKey) return;
                  e.preventDefault();
                  setDragZone('minor');
                }}
                onDragLeave={() => setDragZone(null)}
                onDrop={(e) => handleDropOnZone(e, 'minor')}
                className={`rounded-lg border-2 border-dashed p-2 flex items-center gap-2 transition ${
                  dragZone === 'minor'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-surface-variant bg-surface-container-lowest'
                }`}
              >
                <Icon name="book" size={18} className="text-purple-600" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    Minor subjects
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    {minorCount} selected · drag a row here
                  </p>
                </div>
              </div>
              </div>
            </div>
          )}

          <div className="max-h-[400px] overflow-auto border border-surface-variant rounded-lg">
            {[...rowsByTable.entries()].map(([tableId, rows]) => {
              const table = tables.find((t) => String(t.tableId) === String(tableId));
              const collapsed = collapsedTables.has(tableId);
              const checkedCount = rows.filter((r) => r.checked && r.action !== 'skip').length;
              return (
                <div key={tableId} className="border-b border-surface-variant last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleTableCollapsed(tableId)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-surface-container-low hover:bg-surface-container-high transition sticky top-0 z-10"
                  >
                    <Icon
                      name={collapsed ? 'chevron_right' : 'expand_more'}
                      size={16}
                      className="text-slate-500"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      {table ? tableLabel(table) : 'Table'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {rows.length} row{rows.length === 1 ? '' : 's'}
                    </span>
                    <span className="ml-auto text-[10px] text-primary font-semibold">
                      {checkedCount} selected
                    </span>
                  </button>
                  {!collapsed && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 bg-surface-container-lowest border-b border-surface-variant">
                          <th className="w-6 px-1 py-1.5"></th>
                          <th className="w-8 px-2 py-1.5"></th>
                          <th className="text-left px-2 py-1.5 font-semibold">
                            Code
                          </th>
                          <th className="text-left px-2 py-1.5 font-semibold">
                            Title
                          </th>
                          <th className="text-right px-2 py-1.5 font-semibold">
                            Lec
                          </th>
                          <th className="text-right px-2 py-1.5 font-semibold">
                            Lab
                          </th>
                          <th className="text-right px-2 py-1.5 font-semibold">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const suspicious = isSuspiciousTitle(row.title);
                          return (
                            <tr
                              key={row.key}
                              draggable={row.action === 'subject'}
                              onDragStart={(e) => handleRowDragStart(e, row)}
                              onDragEnd={handleRowDragEnd}
                              className={`border-t border-surface-variant ${
                                row.status === 'invalid' ? 'bg-amber-50' : ''
                              } ${row.action === 'skip' ? 'opacity-50' : ''} ${
                                draggedRowKey === row.key ? 'opacity-50' : ''
                              }`}
                            >
                              <td className="px-1 py-1.5 text-center align-top">
                                {row.action === 'subject' ? (
                                  <span
                                    className="inline-flex cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700"
                                    title="Drag anywhere on this row to Major or Minor"
                                  >
                                    <Icon name="drag_indicator" size={14} />
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={row.checked}
                                  onChange={(e) =>
                                    setReviewRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key
                                          ? { ...r, checked: e.target.checked }
                                          : r,
                                      ),
                                    )
                                  }
                                  className="w-4 h-4 accent-primary"
                                />
                              </td>
                              <td className="px-2 py-1.5 font-mono align-top">
                                <div className="flex flex-col gap-1 min-w-[150px]">
                                  <select
                                    value={row.action}
                                    onChange={(e) => {
                                      const act = e.target
                                        .value as ReviewRow['action'];
                                      const autoTotalOnly =
                                        act === 'elective' &&
                                        parseUnits(row.lec) === 0 &&
                                        parseUnits(row.lab) === 0 &&
                                        parseUnits(row.total) > 0;
                                      const nextMode: UnitsMode = autoTotalOnly
                                        ? 'total_only'
                                        : row.unitsMode;
                                      setReviewRows((prev) =>
                                        prev.map((r) =>
                                          r.key === row.key
                                            ? {
                                                ...r,
                                                action: act,
                                                unitsMode: nextMode,
                                                ...deriveRowStatus(
                                                  r,
                                                  act,
                                                  nextMode,
                                                ),
                                              }
                                            : r,
                                        ),
                                      );
                                    }}
                                    className="text-[10px] border border-surface-variant rounded px-1 py-0.5 bg-white"
                                  >
                                    <option value="elective">Elective</option>
                                    <option value="subject">Regular subject</option>
                                    {!row.isElectiveTable && (
                                      <option value="slot">Legacy slot</option>
                                    )}
                                    <option value="skip">Skip</option>
                                  </select>

                                  {row.action === 'subject' && (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        placeholder={row.code || 'Code…'}
                                        value={row.typedCode}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setReviewRows((prev) =>
                                            prev.map((r) =>
                                              r.key === row.key
                                                ? { ...r, typedCode: val }
                                                : r,
                                            ),
                                          );
                                        }}
                                        className="w-24 px-1 py-0.5 text-[11px] border border-primary/40 rounded focus:outline-none focus:border-primary"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRowMinor(row.key, !row.isMinor)
                                        }
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border transition ${
                                          row.isMinor
                                            ? 'bg-purple-100 border-purple-300 text-purple-800'
                                            : 'bg-slate-100 border-slate-300 text-slate-700'
                                        }`}
                                        title="Click to switch between Major and Minor; you can also drag the handle"
                                      >
                                        {row.isMinor ? 'Minor' : 'Major'}
                                      </button>
                                    </div>
                                  )}

                                  {row.action === 'elective' && (
                                    <>
                                      <select
                                        value={row.subjectId}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setReviewRows((prev) =>
                                            prev.map((r) =>
                                              r.key === row.key
                                                ? {
                                                    ...r,
                                                    subjectId: val,
                                                    typedCode: val
                                                      ? ''
                                                      : r.typedCode,
                                                  }
                                                : r,
                                            ),
                                          );
                                        }}
                                        className="w-36 text-[10px] border border-surface-variant rounded px-1 py-0.5 bg-white"
                                        title="Use an existing elective subject, or leave blank to type a code / import an empty field"
                                      >
                                        <option value="">
                                          — New / typed code —
                                        </option>
                                        {electiveGroups.map((group) => (
                                          <optgroup
                                            key={group.label}
                                            label={group.label}
                                          >
                                            {group.items.map((s) => (
                                              <option
                                                key={s.subjectId}
                                                value={s.subjectId}
                                              >
                                                {s.subjectCode} — {s.title}
                                              </option>
                                            ))}
                                          </optgroup>
                                        ))}
                                      </select>

                                      {!row.subjectId && (
                                        <input
                                          type="text"
                                          placeholder={
                                            row.code || 'Code (optional)…'
                                          }
                                          value={row.typedCode}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setReviewRows((prev) =>
                                              prev.map((r) =>
                                                r.key === row.key
                                                  ? { ...r, typedCode: val }
                                                  : r,
                                              ),
                                            );
                                          }}
                                          className="w-28 px-1 py-0.5 text-[11px] border border-primary/40 rounded focus:outline-none focus:border-primary"
                                        />
                                      )}

                                      {!row.subjectId && (
                                        <input
                                          type="text"
                                          list="import-elective-categories"
                                          placeholder="Category (e.g. GEC)"
                                          value={row.electiveCategory}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setReviewRows((prev) =>
                                              prev.map((r) =>
                                                r.key === row.key
                                                  ? {
                                                      ...r,
                                                      electiveCategory: val,
                                                    }
                                                  : r,
                                              ),
                                            );
                                          }}
                                          className="w-32 px-1 py-0.5 text-[11px] border border-surface-variant rounded focus:outline-none focus:border-primary"
                                          title="Optional group shown in elective filters and dropdowns"
                                        />
                                      )}

                                      <select
                                        value={row.unitsMode}
                                        onChange={(e) => {
                                          const mode = e.target
                                            .value as UnitsMode;
                                          setReviewRows((prev) =>
                                            prev.map((r) =>
                                              r.key === row.key
                                                ? {
                                                    ...r,
                                                    unitsMode: mode,
                                                    ...deriveRowStatus(
                                                      r,
                                                      r.action,
                                                      mode,
                                                    ),
                                                  }
                                                : r,
                                            ),
                                          );
                                        }}
                                        className="w-28 text-[10px] border border-surface-variant rounded px-1 py-0.5 bg-white"
                                        title="Total-only electives store only the total units"
                                      >
                                        <option value="lec_lab">Lec/Lab</option>
                                        <option value="total_only">
                                          Total only
                                        </option>
                                      </select>

                                      {isEmptyElectiveRow(row) && (
                                        <div className="flex items-center gap-1.5">
                                          <span
                                            className="text-[9px] text-amber-700 font-semibold"
                                            title="No code: this row is an empty prospectus field filled later"
                                          >
                                            Empty elective field
                                          </span>
                                          <label
                                            className="flex items-center gap-1 text-[9px] text-slate-600"
                                            title="Number of identical offerings for this term (e.g. Software Development + Robotics = 2)"
                                          >
                                            Copies
                                            <input
                                              type="number"
                                              min={1}
                                              max={20}
                                              value={row.copies}
                                              onChange={(e) => {
                                                const value = Number(
                                                  e.target.value,
                                                );
                                                const copies = Math.min(
                                                  Math.max(
                                                    Number.isFinite(value)
                                                      ? value
                                                      : 1,
                                                    1,
                                                  ),
                                                  20,
                                                );
                                                setReviewRows((prev) =>
                                                  prev.map((r) =>
                                                    r.key === row.key
                                                      ? { ...r, copies }
                                                      : r,
                                                  ),
                                                );
                                              }}
                                              className="w-12 px-1 py-0.5 text-[10px] border border-surface-variant rounded focus:outline-none focus:border-primary"
                                            />
                                          </label>
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {row.warning && (
                                    <span className="text-[9px] text-amber-700">
                                      {row.warning}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className="px-2 py-1.5 max-w-[200px] truncate text-slate-700"
                                title={row.title}
                              >
                                {row.title || '—'}
                                {suspicious && (
                                  <span
                                    className="ml-1 px-1.5 py-0.5 rounded bg-orange-200 text-orange-900 text-[9px] font-bold uppercase tracking-wider"
                                    title="Title looks like garbage from the PDF — check before importing"
                                  >
                                    Suspicious
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                                {row.lec || '—'}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                                {row.lab || '—'}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                                {row.total || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          {warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <ul className="list-disc list-inside space-y-0.5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-on-surface-variant flex flex-wrap gap-x-3 gap-y-1">
            <span>
              Ready: <strong className="text-primary">{readyCount}</strong>
            </span>
            {electiveCount > 0 && (
              <span>
                · Electives:{' '}
                <strong className="text-teal-700">{electiveCount}</strong>
              </span>
            )}
            {emptyFieldCount > 0 && (
              <span>
                · Empty fields:{' '}
                <strong className="text-amber-700">{emptyFieldCount}</strong>
              </span>
            )}
            {slotCount > 0 && (
              <span>
                · Legacy slots:{' '}
                <strong className="text-amber-700">{slotCount}</strong>
              </span>
            )}
            {classifiableRows.length > 0 && (
              <>
                <span>
                  · Major: <strong className="text-primary">{majorCount}</strong>
                </span>
                <span>
                  · Minor:{' '}
                  <strong className="text-purple-700">{minorCount}</strong>
                </span>
              </>
            )}
          </div>

          {classifiableRows.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-300 text-blue-900 text-xs flex items-start gap-2">
              <Icon name="info" size={16} className="shrink-0 mt-0.5" />
              <span>
                Drag a regular row by pressing anywhere outside its fields, or
                click its Major/Minor badge. For a longer list, open the{' '}
                <strong>classifier</strong> and switch between year/term tabs.
                Minor subjects are flagged in one step here instead of editing
                each subject later. Elective rows are classified when they are
                filled.
              </span>
            </div>
          )}

          {emptyFieldCount > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <span>
                {emptyFieldCount} empty elective field
                {emptyFieldCount === 1 ? '' : 's'} will be added to the
                prospectus without a code. Fill{' '}
                {emptyFieldCount === 1 ? 'it' : 'them'} later from the
                Prospectus page by choosing an existing elective or typing a
                code. Use <strong>Copies</strong> when a term has more than one
                identical offering.
              </span>
            </div>
          )}

          {electiveSubjects.length === 0 && electiveCount > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-300 text-blue-900 text-xs flex items-start gap-2">
              <Icon name="info" size={16} className="shrink-0 mt-0.5" />
              <span>
                There are no elective subjects in the catalog yet. Choose{' '}
                <strong>Regular subject</strong> and type a real code, or leave
                these rows as empty elective fields and add the electives
                afterward.
              </span>
            </div>
          )}
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-green-100 border border-green-300 text-green-900">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="check_circle" size={20} />
              <span className="font-semibold">Import complete</span>
            </div>
            <ul className="text-sm space-y-1 pl-6">
              <li>
                {result.subjectsCreated} new subject
                {result.subjectsCreated === 1 ? '' : 's'} created
              </li>
              <li>
                {result.prospectusCreated} prospectus entr
                {result.prospectusCreated === 1 ? 'y' : 'ies'} added
              </li>
              {result.slotsCreated > 0 && (
                <li>
                  {result.slotsCreated} elective subject
                  {result.slotsCreated === 1 ? '' : 's'} imported
                </li>
              )}
              {result.temporaryCodes?.length > 0 && (
                <li className="text-amber-800">
                  {result.temporaryCodes.length} empty elective field
                  {result.temporaryCodes.length === 1 ? '' : 's'} to fill later
                </li>
              )}
            </ul>
          </div>

          {result.warnings?.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="warning"
                  size={20}
                  className="text-amber-700 shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    Import warnings
                  </p>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-amber-800">
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {result.skippedRows?.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="error"
                  size={20}
                  className="text-red-700 shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-900">
                    {result.skippedRows.length} row
                    {result.skippedRows.length === 1 ? '' : 's'} not imported
                  </p>
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto text-xs">
                    {result.skippedRows.map((row, index) => (
                      <li
                        key={`${row.tableId}-${row.rowIndex}-${index}`}
                        className="flex items-baseline gap-2 text-red-800"
                      >
                        <span className="font-mono font-semibold">
                          {row.code || '(no code)'}
                        </span>
                        <span className="truncate">{row.title || '—'}</span>
                        <span className="ml-auto shrink-0 font-semibold">
                          {SKIP_REASON_LABELS[row.reason] ?? row.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {result.temporaryCodes?.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="warning"
                  size={20}
                  className="text-amber-700 shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    Empty elective fields
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    These fields have no fixed course code yet. Fill them from
                    the Prospectus page — choose an existing elective or type a
                    code — before plotting or auto-generating.
                  </p>
                  <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {result.temporaryCodes.map((temp) => (
                      <li
                        key={temp.subjectId}
                        className="flex items-start gap-3 p-2 rounded border border-amber-200 bg-white"
                      >
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded shrink-0 bg-amber-200 text-amber-900">
                          Empty field
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono font-bold text-amber-800 text-xs">
                              {temp.subjectCode}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              {yearTermLabel(temp.yearLevel, temp.semester)}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface truncate mt-0.5">
                            {temp.title}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {result.slots && result.slots.length > 0 && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Icon name="info" filled size={20} className="text-blue-700 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-900">
                    {result.slots.length} elective prospectus row
                    {result.slots.length === 1 ? '' : 's'} imported
                  </p>
                  <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {result.slots.map((slot: SlotCreated) => (
                      <li key={slot.subjectId} className="flex items-start gap-3 p-2 rounded border border-blue-200 bg-white">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded shrink-0 ${
                            slot.isPlaceholder
                              ? 'bg-amber-200 text-amber-900'
                              : 'bg-teal-200 text-teal-900'
                          }`}
                        >
                          {slot.isPlaceholder ? 'Empty field' : 'Elective'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono font-bold text-primary text-xs">
                              {slot.subjectCode}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              {yearTermLabel(slot.yearLevel, slot.semester)}
                            </span>
                            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
                              {slot.unitsMode === 'total_only'
                                ? 'Total only'
                                : 'Lec/Lab'}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface truncate mt-0.5">
                            {slot.title}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Major/Minor classifier (stacked on every year/term in the import) ── */}
      <Modal
        open={classifyOpen && step === 'review'}
        onClose={() => setClassifyOpen(false)}
        title="Separate major and minor subjects"
        description="Minor subjects are offered by another department. Everything is Major unless you mark it Minor here."
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setGroupMinor(classifyGroup, false)}
              className="px-3 py-2 text-xs font-semibold border border-surface-variant rounded-lg text-slate-700 hover:bg-surface-container-high transition"
            >
              All major
            </button>
            <button
              type="button"
              onClick={() => setGroupMinor(classifyGroup, true)}
              className="px-3 py-2 text-xs font-semibold border border-purple-300 rounded-lg text-purple-800 hover:bg-purple-50 transition"
            >
              All minor
            </button>
            <button
              type="button"
              onClick={() => setClassifyOpen(false)}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg"
            >
              Done
            </button>
          </>
        }
      >
        {classifiableRows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            This import has no regular subjects to classify. Elective rows are
            classified when they are filled later.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Year/term tabs keep a multi-year import easy to review. */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setClassifyGroup('all')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                  classifyGroup === 'all'
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-lowest text-slate-600 border-surface-variant hover:bg-surface-container-high'
                }`}
              >
                All terms ({classifiableRows.length})
              </button>
              {classifyGroups.map((group) => {
                const total = classifiableRows.filter(
                  (r) =>
                    `${r.yearLevel ?? 'any'}-${r.semester ?? 'any'}` ===
                    group.key,
                ).length;
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setClassifyGroup(group.key)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                      classifyGroup === group.key
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-lowest text-slate-600 border-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {group.label} ({total})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
              <span>
                Major:{' '}
                <strong className="text-primary">{classifyMajorCount}</strong>
              </span>
              <span>
                Minor:{' '}
                <strong className="text-purple-700">
                  {classifyMinorCount}
                </strong>
              </span>
            </div>

            <ul className="divide-y divide-surface-variant border border-surface-variant rounded-lg overflow-hidden">
              {classifyRows.map((row) => (
                <li
                  key={row.key}
                  className={`px-3 py-2 flex items-center gap-3 ${
                    row.checked ? '' : 'opacity-60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {row.typedCode.trim() || row.code || '(no code)'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        {yearTermLabel(row.yearLevel, row.semester)}
                      </span>
                      {!row.checked && (
                        <span className="text-[10px] text-amber-700 font-semibold">
                          Not selected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface truncate">
                      {row.title}
                    </p>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-surface-variant shrink-0">
                    <button
                      type="button"
                      onClick={() => setRowMinor(row.key, false)}
                      aria-pressed={!row.isMinor}
                      className={`px-2.5 py-1 text-[10px] font-bold transition ${
                        row.isMinor
                          ? 'bg-white text-slate-600 hover:bg-slate-100'
                          : 'bg-primary text-on-primary'
                      }`}
                    >
                      Major
                    </button>
                    <button
                      type="button"
                      onClick={() => setRowMinor(row.key, true)}
                      aria-pressed={row.isMinor}
                      className={`px-2.5 py-1 text-[10px] font-bold transition ${
                        row.isMinor
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Minor
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-[11px] text-on-surface-variant">
              Tip: you can also drag a regular row in the review list onto the
              Major or Minor box, or click the badge beside its code.
            </p>
          </div>
        )}
      </Modal>
    </Modal>
  );
}

/**
 * Parse the unit strings found in prospectus PDFs.
 *
 * Decimals are preserved. A fraction such as "3/3" means three units, while
 * "2/1" is a squashed "2 1" and sums to three; stripping the slash would
 * turn both into "33".
 */
export function parseUnits(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = String(v).replace(/[^0-9./-]/g, '');
  if (!cleaned) return 0;

  if (cleaned.includes('/')) {
    const parts = cleaned
      .split('/')
      .map((part) => parseFloat(part))
      .filter((part) => Number.isFinite(part));
    if (parts.length === 0) return 0;
    if (parts.every((part) => part === parts[0])) return parts[0];
    return parts.reduce((sum, part) => sum + part, 0);
  }

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}