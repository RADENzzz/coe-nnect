import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { extractFromPdf, confirmImport } from '@/api/prospectus-pdfs.api';
import type {
  ProspectusPdfTable,
  SemesterType,
  ImportResult,
  SynthesizedCode,
} from '../types';

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
  title: string;
  prereq: string;
  lec: string;
  lab: string;
  total: string;
  status: 'new' | 'exists' | 'invalid';
  codeOrigin: 'explicit' | 'loose' | 'missing';
  warning?: string;
  checked: boolean;
}

export default function ImportProspectusDialog({
  open,
  onClose,
  pdfId,
  tables,
  programs,
  departmentId,
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
  const [ocrRunning, setOcrRunning] = useState(false);
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

  const handleExtract = async (useOcr = false) => {
    setError(null);
    setExtracting(true);
    setOcrRunning(useOcr);
    try {
      const res = await extractFromPdf(
        pdfId,
        [...selectedTableIds],
        useOcr,
      );
      const rows: ReviewRow[] = [];
      for (const region of res.regions) {
        const table = tables.find(
          (t) => String(t.tableId) === region.table_id,
        );
        if (!table) continue;
        for (const sub of region.subjects) {
          const code = (sub.code ?? '').trim();
          const lec = parseIntSafe(sub.lec);
          const lab = parseIntSafe(sub.lab);
          const total = parseIntSafe(sub.total);

          let status: ReviewRow['status'] = 'new';
          let codeOrigin: ReviewRow['codeOrigin'] = 'explicit';
          let warning: string | undefined;

          if (!code) codeOrigin = 'missing';
          else if (!SUBJECT_CODE_RE.test(code)) codeOrigin = 'loose';

          if (!sub.title || !sub.title.trim()) {
            status = 'invalid';
            warning = 'Missing subject title';
          } else if (lec + lab !== total) {
            status = 'invalid';
            warning = `lec+lab≠total (${lec}+${lab}≠${total})`;
          }

          rows.push({
            key: `${region.table_id}::${code || 'BLANK'}::${rows.length}`,
            tableId: region.table_id,
            yearLevel: table.yearLevel,
            semester: table.semester,
            code,
            title: sub.title,
            prereq: sub.prereq,
            lec: sub.lec,
            lab: sub.lab,
            total: sub.total,
            status,
            codeOrigin,
            warning,
            checked: status === 'new',
          });
        }
      }
      setReviewRows(rows);
      setWarnings(res.warnings);
      setStep('review');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Extraction failed');
    } finally {
      setExtracting(false);
      setOcrRunning(false);
    }
  };

  const handleImport = async () => {
    setError(null);
    setImporting(true);
    try {
      const checkedRows = reviewRows.filter((r) => r.checked);
      const byTable = new Map<string, ReviewRow[]>();
      for (const row of checkedRows) {
        const list = byTable.get(row.tableId) ?? [];
        list.push(row);
        byTable.set(row.tableId, list);
      }
      const regions = [...byTable.entries()].map(([tableId, rows]) => ({
        table_id: Number(tableId),
        subjects: rows.map((r) => ({
          code: r.code,
          title: r.title,
          prereq: r.prereq,
          lec: r.lec,
          lab: r.lab,
          total: r.total,
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
    if (importing || extracting) return;
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
    (r) => r.checked && r.status === 'new',
  ).length;
  const invalidCount = reviewRows.filter(
    (r) => r.status === 'invalid',
  ).length;
  const existingCount = reviewRows.filter(
    (r) => r.status === 'exists',
  ).length;
  const placeholderCount = reviewRows.filter(
    (r) => r.checked && r.codeOrigin === 'missing',
  ).length;
  const looseCount = reviewRows.filter(
    (r) => r.checked && r.codeOrigin === 'loose',
  ).length;

  /** Nothing in any cell — almost always an image-only page. */
  const nothingReadable = useMemo(
    () =>
      reviewRows.length === 0 ||
      reviewRows.every(
        (r) => !r.code.trim() && !r.title.trim(),
      ),
    [reviewRows],
  );

  // ── Filtered + grouped rows for the review step ──
  const filteredReviewRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return reviewRows;
    return reviewRows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q),
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

  // ── Bulk select helpers ──
  const allSelectableChecked = useMemo(() => {
    const selectable = reviewRows.filter((r) => r.status === 'new');
    return (
      selectable.length > 0 &&
      selectable.every((r) => r.checked)
    );
  }, [reviewRows]);

  const someSelectableChecked = useMemo(() => {
    const selectable = reviewRows.filter((r) => r.status === 'new');
    return selectable.some((r) => r.checked);
  }, [reviewRows]);

  const setAllChecked = (checked: boolean) => {
    setReviewRows((prev) =>
      prev.map((r) =>
        r.status === 'new' ? { ...r, checked } : r,
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
              onClick={() => handleExtract(true)}
              disabled={
                extracting || selectedTableIds.size === 0 || !programId
              }
              title="For scanned pages or screenshots — reads the text from the page image. Takes longer."
              className="px-4 py-2 text-sm font-semibold border border-primary text-primary hover:bg-primary/5 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {extracting && ocrRunning ? (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              ) : (
                <Icon name="document_scanner" size={16} />
              )}
              {extracting && ocrRunning ? 'Reading…' : 'Read with OCR'}
            </button>
            <button
              onClick={() => handleExtract(false)}
              disabled={
                extracting || selectedTableIds.size === 0 || !programId
              }
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {extracting && !ocrRunning && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {extracting && !ocrRunning ? 'Extracting…' : 'Extract'}
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
              {importing && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {importing
                ? 'Importing…'
                : `Import ${readyCount} subject${readyCount === 1 ? '' : 's'}`}
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
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
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
              {visiblePrograms.length === 0 && (
                <option value="">No programs available</option>
              )}
              {visiblePrograms.map((p) => (
                <option key={p.programId} value={p.programId}>
                  [{p.programCode}] {p.programName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Tables to Import
              </label>
              {tables.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allSelected =
                      selectedTableIds.size === tables.length;
                    setSelectedTableIds(
                      allSelected
                        ? new Set()
                        : new Set(tables.map((t) => t.tableId)),
                    );
                  }}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  {selectedTableIds.size === tables.length
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto border border-surface-variant rounded-lg p-2">
              {tables.length === 0 && (
                <p className="text-sm text-on-surface-variant text-center py-4">
                  No tables created yet.
                </p>
              )}
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
          <div className="text-sm text-on-surface-variant">
            Review extracted subjects. Uncheck any you don't want to import.
            Blank or loose codes will be imported with placeholders or as-is.
          </div>

          {nothingReadable && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-3">
              <Icon
                name="document_scanner"
                size={18}
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1">
                <strong>No readable text in these cells.</strong> If the pages
                are scans or screenshots, OCR can read them — it takes a few
                seconds per page.
              </div>
              <button
                type="button"
                onClick={() => handleExtract(true)}
                disabled={extracting}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition disabled:opacity-50 shrink-0 flex items-center gap-1.5"
              >
                {extracting && (
                  <Icon
                    name="progress_activity"
                    size={12}
                    className="animate-spin"
                  />
                )}
                {extracting ? 'Reading…' : 'Read with OCR'}
              </button>
            </div>
          )}

          {/* Filter + bulk controls */}
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
                ref={(el) => {
                  if (el) el.indeterminate = someSelectableChecked && !allSelectableChecked;
                }}
                onChange={(e) => setAllChecked(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Select all
            </label>
          </div>

          {/* Grouped rows */}
          <div className="max-h-[400px] overflow-auto border border-surface-variant rounded-lg">
            {[...rowsByTable.entries()].map(([tableId, rows]) => {
              const table = tables.find(
                (t) => String(t.tableId) === String(tableId),
              );
              const collapsed = collapsedTables.has(tableId);
              const checkedCount = rows.filter((r) => r.checked).length;
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
                        <tr className="text-slate-500">
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
                          <th className="text-left px-2 py-1.5 font-semibold">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.key}
                            className={`border-t border-surface-variant ${
                              row.status === 'invalid' ? 'bg-amber-50' : ''
                            }`}
                          >
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={row.checked}
                                disabled={row.status === 'invalid'}
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
                            <td className="px-2 py-1.5 font-mono font-semibold">
                              <div className="flex items-center gap-1.5">
                                {row.codeOrigin === 'missing' && (
                                  <span
                                    className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[9px] font-bold uppercase tracking-wider"
                                    title="Blank code — will be assigned a placeholder"
                                  >
                                    Blank
                                  </span>
                                )}
                                {row.codeOrigin === 'loose' && (
                                  <span
                                    className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-900 text-[9px] font-bold uppercase tracking-wider"
                                    title="Code doesn't match the standard pattern — will be imported as-is"
                                  >
                                    Loose
                                  </span>
                                )}
                                <span>{row.code || '—'}</span>
                              </div>
                            </td>
                            <td
                              className="px-2 py-1.5 max-w-[240px] truncate"
                              title={row.title}
                            >
                              {row.title || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              {row.lec || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              {row.lab || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              {row.total || '—'}
                            </td>
                            <td className="px-2 py-1.5">
                              {row.status === 'invalid' && (
                                <span
                                  className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-semibold"
                                  title={row.warning}
                                >
                                  Invalid
                                </span>
                              )}
                              {row.status === 'new' && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-semibold">
                                  New
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
            {rowsByTable.size === 0 && (
              <div className="py-8 text-center text-sm text-on-surface-variant">
                No rows match your filter.
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-xs">
              <div className="font-semibold mb-1">
                {warnings.length} warning{warnings.length === 1 ? '' : 's'}
              </div>
              <ul className="list-disc list-inside space-y-0.5 max-h-[100px] overflow-auto">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-on-surface-variant flex flex-wrap gap-x-3 gap-y-1">
            <span>
              Ready: <strong className="text-primary">{readyCount}</strong>
            </span>
            {existingCount > 0 && (
              <span>
                · Existing: <strong>{existingCount}</strong>
              </span>
            )}
            {invalidCount > 0 && (
              <span>
                · Invalid: <strong className="text-amber-700">{invalidCount}</strong>
              </span>
            )}
            {placeholderCount > 0 && (
              <span>
                · Placeholder codes: <strong className="text-amber-700">{placeholderCount}</strong>
              </span>
            )}
            {looseCount > 0 && (
              <span>
                · Loose codes: <strong className="text-orange-700">{looseCount}</strong>
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
              {result.subjectsExisting > 0 && (
                <li>
                  {result.subjectsExisting} subject
                  {result.subjectsExisting === 1 ? '' : 's'} already existed
                </li>
              )}
              {result.prospectusSkipped > 0 && (
                <li>
                  {result.prospectusSkipped} prospectus entr
                  {result.prospectusSkipped === 1 ? 'y' : 'ies'} skipped
                  (already present)
                </li>
              )}
              {result.skippedRows > 0 && (
                <li>
                  {result.skippedRows} row
                  {result.skippedRows === 1 ? '' : 's'} skipped (invalid data)
                </li>
              )}
            </ul>
          </div>

          {result.synthesizedCodes && result.synthesizedCodes.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Icon
                  name="warning"
                  filled
                  size={20}
                  className="text-amber-700 shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    {result.synthesizedCodes.length} subject
                    {result.synthesizedCodes.length === 1 ? '' : 's'} imported
                    with a placeholder or loose code
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    Edit these on the Subjects page to assign real codes when
                    you know them.
                  </p>

                  <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto">
                    {result.synthesizedCodes.map((sc: SynthesizedCode) => (
                      <li
                        key={sc.subjectCode}
                        className="flex items-start gap-3 p-2 rounded border border-amber-200 bg-white"
                      >
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded shrink-0 ${
                            sc.origin === 'synthesized'
                              ? 'bg-amber-200 text-amber-900'
                              : 'bg-orange-200 text-orange-900'
                          }`}
                        >
                          {sc.origin === 'synthesized'
                            ? 'Placeholder'
                            : 'Loose'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono font-bold text-primary text-xs">
                              {sc.subjectCode}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              Y{sc.yearLevel} · {sc.semester}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface truncate mt-0.5">
                            {sc.title}
                          </p>
                        </div>
                        <Link
                          to="/subjects"
                          className="text-[11px] font-semibold text-primary hover:underline whitespace-nowrap shrink-0"
                          onClick={handleClose}
                        >
                          Edit →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-xs">
              <div className="font-semibold mb-1">Warnings</div>
              <ul className="list-disc list-inside space-y-0.5 max-h-[150px] overflow-auto">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
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