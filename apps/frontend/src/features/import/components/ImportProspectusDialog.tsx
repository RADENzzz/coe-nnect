import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { confirmImport } from '@/api/prospectus-pdfs.api';
import type {
  ProspectusPdfTable,
  SemesterType,
  ImportResult,
  SlotCreated,
  ColumnRole
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
  code: string;
  typedCode: string;
  title: string;
  prereq: string;
  lec: string;
  lab: string;
  total: string;
  status: 'new' | 'exists' | 'invalid';
  action: 'subject' | 'slot' | 'skip';
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

        let status: ReviewRow['status'] = 'new';
        let warning: string | undefined;

        if (!title) {
          status = 'invalid';
          warning = 'Missing subject title';
        } else if (lec + lab !== total) {
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
          code,
          typedCode: '',
          title,
          prereq: cells.prereq.trim(),
          lec: cells.lec.trim(),
          lab: cells.lab.trim(),
          total: cells.total.trim(),
          status,
          // Default: if no code, assume it's an elective slot.
          action: code ? 'subject' : 'slot',
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
          code: r.action === 'subject' ? (r.typedCode.trim() || r.code) : '',
          title: r.title,
          prereq: r.prereq,
          lec: r.lec,
          lab: r.lab,
          total: r.total,
          action: r.action,
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
                    <div className="text-sm font-semibold">
                      Year {t.yearLevel} · {t.semester} Semester
                    </div>
                    <div className="text-xs text-on-surface-variant">
                      {t.rows.length} row{t.rows.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
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
                              <td className="px-2 py-1.5 font-mono">
                                {row.code ? (
                                  <span className="font-semibold">{row.code}</span>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    <select
                                      value={row.action}
                                      onChange={(e) => {
                                        const act = e.target.value as 'subject' | 'slot' | 'skip';
                                        setReviewRows(prev => prev.map(r => r.key === row.key ? { ...r, action: act } : r));
                                      }}
                                      className="text-[10px] border border-surface-variant rounded px-1 py-0.5 bg-white"
                                    >
                                      <option value="slot">Elective Slot</option>
                                      <option value="subject">Type Code</option>
                                      <option value="skip">Skip</option>
                                    </select>
                                    {row.action === 'subject' && (
                                      <input
                                        type="text"
                                        placeholder="Code…"
                                        value={row.typedCode}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setReviewRows(prev => prev.map(r => r.key === row.key ? { ...r, typedCode: val } : r));
                                        }}
                                        className="w-20 px-1 py-0.5 text-[11px] border border-primary/40 rounded mt-0.5 focus:outline-none focus:border-primary"
                                      />
                                    )}
                                  </div>
                                )}
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
            {slotCount > 0 && (
              <span>
                · Slots: <strong className="text-amber-700">{slotCount}</strong>
              </span>
            )}
          </div>
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
                  {result.slotsCreated} elective slot
                  {result.slotsCreated === 1 ? '' : 's'} created
                </li>
              )}
            </ul>
          </div>

          {result.slots && result.slots.length > 0 && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Icon name="info" filled size={20} className="text-blue-700 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-900">
                    {result.slots.length} elective slot{result.slots.length === 1 ? '' : 's'} created
                  </p>
                  <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {result.slots.map((slot: SlotCreated) => (
                      <li key={slot.subjectCode} className="flex items-start gap-3 p-2 rounded border border-blue-200 bg-white">
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded shrink-0 bg-blue-200 text-blue-900">
                          Slot
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono font-bold text-primary text-xs">
                              {slot.subjectCode}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              Y{slot.yearLevel} · {slot.semester}
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