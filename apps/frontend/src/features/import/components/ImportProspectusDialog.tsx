import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import {
  extractFromPdf,
  confirmImport,
} from '@/api/prospectus-pdfs.api';
import type {
  ProspectusPdfTable,
  SemesterType,
} from '../types';
import type { ImportResult } from '../types';

interface ImportProspectusDialogProps {
  open: boolean;
  onClose: () => void;
  pdfId: string;
  tables: ProspectusPdfTable[];
  programs: { programId: string; programCode: string; programName: string; deptId: string }[];
  departmentId: string;
}

type Step = 'select' | 'review' | 'result';

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
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const visiblePrograms = useMemo(() => {
    if (!programs || programs.length === 0) return [];
    if (!departmentId) return programs;
    return programs.filter(
      (p) => p.deptId != null && String(p.deptId) === String(departmentId),
    );
  }, [programs, departmentId]);

  // Auto-select the first visible program when the list changes
  // and the current selection isn't in it.
  useEffect(() => {
    if (visiblePrograms.length === 0) return;
    const stillValid = visiblePrograms.some(
      (p) => String(p.programId) === String(programId),
    );
    if (!stillValid) {
      setProgramId(String(visiblePrograms[0].programId));
    }
  }, [visiblePrograms, programId]);

  const toggleTable = (tableId: string) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  };

  
  const handleExtract = async () => {
    setError(null);
    setExtracting(true);
    try {
      const result = await extractFromPdf(pdfId, [...selectedTableIds]);
      const rows: ReviewRow[] = [];
      for (const region of result.regions) {
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
          let warning: string | undefined;
          if (!code || !code.match(/^[A-Za-z&]{2,10}(\s+[A-Za-z0-9]+)*\s*\d+/)) {
            status = 'invalid';
            warning = 'Missing or invalid subject code';
          } else if (lec + lab !== total) {
            status = 'invalid';
            warning = `lec+lab≠total (${lec}+${lab}≠${total})`;
          }
          rows.push({
            key: `${region.table_id}::${code}::${rows.length}`,
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
            warning,
            checked: status === 'new',
          });
        }
      }
      setReviewRows(rows);
      setWarnings(result.warnings);
      setStep('review');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Extraction failed');
    } finally {
      setExtracting(false);
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
    }, 200);
  };

  const readyCount = reviewRows.filter(
    (r) => r.checked && r.status === 'new',
  ).length;
  const existingCount = reviewRows.filter(
    (r) => r.status === 'exists',
  ).length;

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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleExtract}
              disabled={extracting || selectedTableIds.size === 0 || !programId}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50"
            >
              {extracting ? 'Extracting…' : 'Extract'}
            </button>
          </>
        ) : step === 'review' ? (
          <>
            <button
              onClick={() => setStep('select')}
              disabled={importing}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={importing || readyCount === 0}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50"
            >
              {importing
                ? 'Importing…'
                : `Import ${readyCount} subject${readyCount === 1 ? '' : 's'}`}
            </button>
          </>
        ) : (
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition"
          >
            Close
          </button>
        )
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          {error}
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
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Tables to Import
            </label>
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
                    className="w-4 h-4"
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
          </div>

          <div className="max-h-[400px] overflow-auto border border-surface-variant rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-surface-container-low sticky top-0">
                <tr>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-semibold">
                    Code
                  </th>
                  <th className="text-left px-2 py-2 font-semibold">
                    Title
                  </th>
                  <th className="text-right px-2 py-2 font-semibold">
                    Lec
                  </th>
                  <th className="text-right px-2 py-2 font-semibold">
                    Lab
                  </th>
                  <th className="text-right px-2 py-2 font-semibold">
                    Total
                  </th>
                  <th className="text-left px-2 py-2 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((row) => (
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
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono font-semibold">
                      {row.code || '—'}
                    </td>
                    <td className="px-2 py-1.5 max-w-[240px] truncate" title={row.title}>
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
                        <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-semibold">
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

          <div className="text-xs text-on-surface-variant">
            Ready to import: <strong>{readyCount}</strong> subject
            {readyCount === 1 ? '' : 's'}
            {existingCount > 0 && (
              <> · {existingCount} already in the system</>
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
              <li>{result.subjectsCreated} new subject{result.subjectsCreated === 1 ? '' : 's'} created</li>
              <li>{result.prospectusCreated} prospectus entr{result.prospectusCreated === 1 ? 'y' : 'ies'} added</li>
              {result.subjectsExisting > 0 && (
                <li>{result.subjectsExisting} subject{result.subjectsExisting === 1 ? '' : 's'} already existed</li>
              )}
              {result.prospectusSkipped > 0 && (
                <li>{result.prospectusSkipped} prospectus entr{result.prospectusSkipped === 1 ? 'y' : 'ies'} skipped (already present)</li>
              )}
              {result.skippedRows > 0 && (
                <li>{result.skippedRows} row{result.skippedRows === 1 ? '' : 's'} skipped (invalid data)</li>
              )}
            </ul>
          </div>

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
  // Strip parentheses, spaces, and any non-numeric chars.
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '-') return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}