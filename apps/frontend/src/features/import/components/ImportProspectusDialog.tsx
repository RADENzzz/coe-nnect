import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
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
import type { TextItem } from '../hooks/usePdfTextLayer';
import { COLUMN_ORDER } from '../types';

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
  textItems: TextItem[] | null; // <--- NEW
}

type Step = 'select' | 'review' | 'result';

const SUBJECT_CODE_RE =
  /^[A-Za-z][A-Za-z0-9&.-]{1,11}(?:\s+[A-Za-z0-9&.-]{1,16}){0,4}$/;

interface ReviewRow {
  key: string;
  tableId: string;
  yearLevel: number;
  semester: SemesterType;
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
  unitsMode: UnitsMode;
  warning?: string;
  checked: boolean;
}

/**
 * Reject titles that are very likely garbage from the PDF:
 *   - "gg gg", "test test", "abc" (repeated or trivially short)
 *   - "x", "1", "-", "???" (no meaningful text)
 *   - empty
 */
function isSuspiciousTitle(title: string): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  const words = t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (words.length === 1 && words[0].length < 4) return true;
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
  const lec = parseIntSafe(row.lec);
  const lab = parseIntSafe(row.lab);
  const total = parseIntSafe(row.total);

  if (action === 'elective' && unitsMode === 'total_only') {
    if (total <= 0) {
      return {
        status: 'invalid',
        warning: 'Total-only elective has no total units',
      };
    }
    return { status: 'new', warning: undefined };
  }
  if ((action === 'subject' || action === 'elective') && lec + lab !== total) {
    return {
      status: 'invalid',
      warning: `lec+lab≠total (${lec}+${lab}≠${total})`,
    };
  }
  return { status: 'new', warning: undefined };
}

export default function ImportProspectusDialog({
  open,
  onClose,
  pdfId,
  tables,
  programs,
  departmentId,
  textItems,
}: ImportProspectusDialogProps) {
  const qc = useQueryClient();
  const location = useLocation();
  const programsPath = location.pathname.startsWith('/dean')
    ? '/dean/programs'
    : '/programs';

  const [step, setStep] = useState<Step>('select');
  const [programId, setProgramId] = useState<string>('');
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
    new Set(tables.map((t) => t.tableId)),
  );
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState('');

  const { data: catalogSubjects = [] } = useQuery({
    queryKey: ['subjects', { includeInactive: false }],
    queryFn: () => fetchSubjects(false),
    enabled: open,
  });

  const electiveSubjects = useMemo(
    () => catalogSubjects.filter((s: SubjectRecord) => s.isElective),
    [catalogSubjects],
  );
  const electiveById = useMemo(() => {
    const m = new Map<string, SubjectRecord>();
    for (const s of electiveSubjects) m.set(String(s.subjectId), s);
    return m;
  }, [electiveSubjects]);

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

  // ── NEW: Build review rows locally from the live text layer ──
  const handleExtractLocal = () => {
    setError(null);
    if (!textItems) {
      setError("Text layer is still loading. Please wait a moment.");
      return;
    }

    const rows: ReviewRow[] = [];
    const newWarnings: string[] = [];

    for (const table of tables) {
      if (!selectedTableIds.has(table.tableId)) continue;

      const sortedRows = [...table.rows].sort((a, b) => b.y_top_pt - a.y_top_pt);

      for (const row of sortedRows) {
        const cells: Record<ColumnRole, string> = {
          code: '', title: '', prereq: '', lec: '', lab: '', total: ''
        };

        for (const col of table.columns) {
          const override = row.cells?.[col.role];
          cells[col.role] =
            typeof override === 'string'
              ? override
              : extractTextInRect(
                  textItems,
                  col.x_start_pt,
                  row.y_bottom_pt,
                  col.x_end_pt,
                  row.y_top_pt
                );
        }

        const code = cells.code.trim();
        const rawTitle = cells.title.trim();
        
        // Normalize spacing just like the backend
        const title = rawTitle
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/([A-Za-z])([0-9])/g, '$1 $2')
          .replace(/\s+/g, ' ');

        const lec = parseIntSafe(cells.lec);
        const lab = parseIntSafe(cells.lab);
        const total = parseIntSafe(cells.total);

        const isElectiveTable = table.tableKind === 'elective';
        const defaultAction: ReviewRow['action'] = isElectiveTable
          ? 'elective'
          : code
          ? 'subject'
          : 'slot';

        // Electives may list only a total. Auto-detect that shape so the
        // lec+lab=total check does not reject a valid total-only row.
        const looksTotalOnly =
          isElectiveTable && lec === 0 && lab === 0 && total > 0;
        const unitsMode: UnitsMode = looksTotalOnly ? 'total_only' : 'lec_lab';

        let status: ReviewRow['status'] = 'new';
        let warning: string | undefined;

        if (!title) {
          status = 'invalid';
          warning = 'Missing subject title';
        } else if (lec + lab !== total && unitsMode !== 'total_only') {
          status = 'invalid';
          warning = `lec+lab≠total (${lec}+${lab}≠${total})`;
        }

        const suspicious = isSuspiciousTitle(title);
        if (suspicious) {
          newWarnings.push(`Table Y${table.yearLevel} ${table.semester}: suspicious title "${title}" (row ${row.row_id})`);
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
          total: cells.total.trim(),
          status,
          action: defaultAction,
          subjectId: '',
          unitsMode,
          warning,
          checked: status === 'new' && !suspicious,
        });
      }
    }

    setReviewRows(rows);
    setWarnings(newWarnings);
    setStep('review');
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
          ...(r.action === 'elective' && r.subjectId
            ? { subject_id: Number(r.subjectId) }
            : {}),
          ...(r.action === 'elective'
            ? { units_mode: r.unitsMode }
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
  const temporaryElectiveCount = reviewRows.filter(
    (r) =>
      r.checked &&
      r.action === 'elective' &&
      !r.subjectId &&
      !(r.typedCode.trim() || r.code),
  ).length;
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
              disabled={selectedTableIds.size === 0 || !programId || !textItems}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              Read Local Text
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
                      Year {t.yearLevel} · {t.semester} Semester
                      {t.tableKind === 'elective' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800">
                          <Icon name="stars" size={9} />
                          Elective
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      {t.rows.length} row{t.rows.length === 1 ? '' : 's'}
                      {t.label ? ` · ${t.label}` : ''}
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
                without a typed code will be imported with a{' '}
                <strong>temporary flagged code</strong> (for example{' '}
                <span className="font-mono">ELEC-Y1S1-AB12CD</span>) and must be
                resolved before plotting or auto-generating.
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
                      Year {table?.yearLevel ?? '?'} · {table?.semester ?? '?'}
                    </span>
                    {table?.tableKind === 'elective' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800">
                        <Icon name="stars" size={9} />
                        Elective table
                      </span>
                    )}
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
                              className={`border-t border-surface-variant ${
                                row.status === 'invalid' ? 'bg-amber-50' : ''
                              } ${row.action === 'skip' ? 'opacity-50' : ''}`}
                            >
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
                                        parseIntSafe(row.lec) === 0 &&
                                        parseIntSafe(row.lab) === 0 &&
                                        parseIntSafe(row.total) > 0;
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
                                        title="Use an existing elective subject, or leave blank to type a code / use a temporary code"
                                      >
                                        <option value="">
                                          — New / typed code —
                                        </option>
                                        {electiveSubjects.map((s) => (
                                          <option
                                            key={s.subjectId}
                                            value={s.subjectId}
                                          >
                                            {s.subjectCode} — {s.title}
                                          </option>
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

                                      {!row.subjectId &&
                                        !(row.typedCode.trim() || row.code) && (
                                          <span
                                            className="text-[9px] text-amber-700 font-semibold"
                                            title="This row will receive a deterministic temporary code"
                                          >
                                            Temporary code
                                          </span>
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
            {temporaryElectiveCount > 0 && (
              <span>
                · Temporary codes:{' '}
                <strong className="text-amber-700">
                  {temporaryElectiveCount}
                </strong>
              </span>
            )}
            {slotCount > 0 && (
              <span>
                · Legacy slots:{' '}
                <strong className="text-amber-700">{slotCount}</strong>
              </span>
            )}
          </div>

          {temporaryElectiveCount > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <span>
                {temporaryElectiveCount} elective row
                {temporaryElectiveCount === 1 ? '' : 's'} will receive a
                deterministic temporary code. You can resolve{' '}
                {temporaryElectiveCount === 1 ? 'it' : 'them'} later from the
                Subjects page; plotting and auto-generate will exclude unresolved
                electives and warn you.
              </span>
            </div>
          )}

          {electiveSubjects.length === 0 && electiveCount > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-300 text-blue-900 text-xs flex items-start gap-2">
              <Icon name="info" size={16} className="shrink-0 mt-0.5" />
              <span>
                There are no elective subjects in the catalog yet. Choose{' '}
                <strong>Regular subject</strong> and type a real code, or let
                these rows import with temporary codes and add the electives
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
                  {result.temporaryCodes.length} temporary code
                  {result.temporaryCodes.length === 1 ? '' : 's'} need
                  resolving
                </li>
              )}
            </ul>
          </div>

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
                    Temporary elective codes
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    These electives have no fixed course code yet. Edit them on
                    the Subjects page before plotting or auto-generating.
                  </p>
                  <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {result.temporaryCodes.map((temp) => (
                      <li
                        key={temp.subjectId}
                        className="flex items-start gap-3 p-2 rounded border border-amber-200 bg-white"
                      >
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded shrink-0 bg-amber-200 text-amber-900">
                          Temp
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono font-bold text-amber-800 text-xs">
                              {temp.subjectCode}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              Y{temp.yearLevel} · {temp.semester}
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
                    {result.slots.length} elective subject
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
                          {slot.isPlaceholder ? 'Temp' : 'Elective'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono font-bold text-primary text-xs">
                              {slot.subjectCode}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              Y{slot.yearLevel} · {slot.semester}
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
    </Modal>
  );
}

function parseIntSafe(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '-') return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}