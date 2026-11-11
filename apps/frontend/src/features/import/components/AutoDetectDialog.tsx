import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import {
  createProspectusPdfTable,
  detectProspectusPdfTables,
} from '@/api/prospectus-pdfs.api';
import type {
  DetectedTableProposal,
  ProspectusPdfTable,
  SemesterType,
} from '../types';
import { MAX_TABLES, SEMESTERS, YEAR_LEVELS } from '../constants';

interface DraftProposal extends DetectedTableProposal {
  selected: boolean;
  year: number;
  semester: SemesterType;
}

interface AutoDetectDialogProps {
  open: boolean;
  onClose: () => void;
  pdfId: string;
  existingTables: ProspectusPdfTable[];
  onCreated: (tables: ProspectusPdfTable[]) => void;
}

function pairKey(year: number, semester: SemesterType) {
  return `${year}:${semester}`;
}

/** First free (year, semester) across mapped tables plus drafts already chosen. */
function firstFreePair(
  taken: { yearLevel: number; semester: SemesterType }[],
  preferredYear?: number | null,
): { year: number; semester: SemesterType } {
  const isTaken = (year: number, semester: SemesterType) =>
    taken.some((t) => t.yearLevel === year && t.semester === semester);

  const years = preferredYear
    ? [preferredYear, ...YEAR_LEVELS.filter((y) => y !== preferredYear)]
    : [...YEAR_LEVELS];
  for (const year of years) {
    for (const { value: semester } of SEMESTERS) {
      if (!isTaken(year, semester)) return { year, semester };
    }
  }
  return { year: YEAR_LEVELS[0], semester: '1st' };
}

function seedDrafts(
  proposals: DetectedTableProposal[],
  existing: ProspectusPdfTable[],
): DraftProposal[] {
  const assigned: { yearLevel: number; semester: SemesterType }[] = [
    ...existing.map((table) => ({
      yearLevel: table.yearLevel,
      semester: table.semester,
    })),
  ];

  return proposals.map((proposal) => {
    let year = proposal.yearLevel;
    let semester = proposal.semester;

    if (year != null && semester != null) {
      // Keep the parser's inference even when it collides — the user needs
      // to see the conflict, not have it silently replaced.
    } else if (year != null) {
      semester = firstFreePair(assigned, year).semester;
    } else {
      const free = firstFreePair(assigned);
      year = free.year;
      semester = free.semester;
    }

    assigned.push({ yearLevel: year, semester });

    return {
      ...proposal,
      selected: proposal.status === 'new',
      year,
      semester,
    };
  });
}

export default function AutoDetectDialog({
  open,
  onClose,
  pdfId,
  existingTables,
  onCreated,
}: AutoDetectDialogProps) {
  const [drafts, setDrafts] = useState<DraftProposal[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const wasOpenRef = useRef(false);

  const runDetect = useCallback(async () => {
    setLoading(true);
    setError(null);
    setScanned(false);
    try {
      const result = await detectProspectusPdfTables(pdfId, {
        maxTables: MAX_TABLES,
      });
      setDrafts(seedDrafts(result.proposals, existingTables));
      setWarnings(result.warnings ?? []);
      setPageCount(result.pageCount);
      setScanned(true);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'Table detection failed';
      setError(Array.isArray(message) ? message.join(', ') : String(message));
    } finally {
      setLoading(false);
    }
  }, [pdfId, existingTables]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDrafts([]);
      setWarnings([]);
      setError(null);
      void runDetect();
    }
    wasOpenRef.current = open;
  }, [open, runDetect]);

  const existingPairs = useMemo(
    () =>
      new Set(
        existingTables.map((table) =>
          pairKey(table.yearLevel, table.semester),
        ),
      ),
    [existingTables],
  );

  const selectedPairCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const draft of drafts) {
      if (!draft.selected) continue;
      const key = pairKey(draft.year, draft.semester);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [drafts]);

  const conflictFor = (draft: DraftProposal): string | null => {
    const key = pairKey(draft.year, draft.semester);
    if (existingPairs.has(key)) {
      return `Year ${draft.year} ${draft.semester} is already mapped`;
    }
    if ((selectedPairCounts.get(key) ?? 0) > 1) {
      return `Another selected proposal also uses Year ${draft.year} ${draft.semester}`;
    }
    return null;
  };

  const ready = drafts.filter(
    (draft) => draft.selected && !conflictFor(draft),
  );

  const updateDraft = (
    proposalId: string,
    patch: Partial<Pick<DraftProposal, 'selected' | 'year' | 'semester'>>,
  ) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.proposalId === proposalId ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const handleCreate = async () => {
    if (ready.length === 0) return;
    setCreating(true);
    setError(null);
    const created: ProspectusPdfTable[] = [];
    const createdIds = new Set<string>();

    for (const draft of ready) {
      try {
        const table = await createProspectusPdfTable(pdfId, {
          year_level: draft.year,
          semester: draft.semester,
          label: draft.label?.slice(0, 200) || undefined,
          region_page_index: draft.pageIndex,
          region_x_start_pt: draft.regionXStartPt,
          region_x_end_pt: draft.regionXEndPt,
          region_y_start_pt: draft.regionYStartPt,
          region_y_end_pt: draft.regionYEndPt,
          columns: draft.columns,
          rows: draft.rows,
        });
        created.push(table);
        createdIds.add(draft.proposalId);
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message ?? 'Could not create the table';
        setError(
          `Created ${created.length} of ${ready.length} tables. ${
            Array.isArray(message) ? message.join(', ') : String(message)
          }`,
        );
        break;
      }
    }

    if (created.length > 0) {
      onCreated(created);
    }
    setDrafts((prev) =>
      prev.filter((draft) => !createdIds.has(draft.proposalId)),
    );
    setCreating(false);

    if (created.length === ready.length) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Auto-detect tables"
      description="The parser scans the PDF text layer and proposes table boundaries, columns, and rows. Nothing is saved until you confirm."
      size="xl"
      busy={creating}
      footer={
        <>
          <button
            type="button"
            onClick={() => void runDetect()}
            disabled={loading || creating}
            className="px-3 py-2 text-sm font-semibold border border-surface-variant rounded-lg hover:bg-surface-container-low transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <Icon
              name="refresh"
              size={15}
              className={loading ? 'animate-spin' : undefined}
            />
            Re-scan
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || ready.length === 0}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
          >
            {creating && (
              <Icon
                name="progress_activity"
                size={15}
                className="animate-spin"
              />
            )}
            {creating
              ? 'Creating…'
              : ready.length > 0
                ? `Create ${ready.length} table${ready.length === 1 ? '' : 's'}`
                : 'Create tables'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-3 rounded-lg border border-surface-variant bg-surface-container-low px-4 py-6">
            <Icon
              name="progress_activity"
              size={22}
              className="animate-spin text-primary"
            />
            <div>
              <p className="text-sm font-semibold text-on-surface">
                Scanning {pageCount > 0 ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : 'the PDF'}…
              </p>
              <p className="text-xs text-on-surface-variant">
                Reading glyph positions, headers, and course-code lines.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <Icon name="error" size={17} className="shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded px-1.5 py-0.5 text-xs font-semibold hover:bg-white/70"
            >
              Dismiss
            </button>
          </div>
        )}

        {scanned && drafts.length === 0 && !loading && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
            <Icon name="search_off" size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No table was recognised.</p>
              <p className="mt-1 text-xs leading-relaxed">
                The header may use labels the detector does not know, or the
                page may be a scan. Draw the table manually with Add Table —
                the text layer still works once the region is placed.
              </p>
            </div>
          </div>
        )}

        {scanned && drafts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
              <Icon name="check_circle" size={13} />
              {drafts.length} candidate table{drafts.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-variant bg-surface-container-low px-2.5 py-1 font-semibold text-on-surface-variant">
              <Icon name="description" size={13} />
              {pageCount} page{pageCount === 1 ? '' : 's'} scanned
            </span>
            <button
              type="button"
              onClick={() =>
                setDrafts((prev) =>
                  prev.map((draft) => ({
                    ...draft,
                    selected:
                      draft.status === 'new' && !conflictFor(draft),
                  })),
                )
              }
              className="ml-auto text-xs font-semibold text-primary hover:underline"
            >
              Select all without conflicts
            </button>
          </div>
        )}

        {drafts.map((draft) => {
          const conflict = conflictFor(draft);
          const confidencePct = Math.round(draft.confidence * 100);
          return (
            <div
              key={draft.proposalId}
              className={`rounded-xl border p-3 transition ${
                conflict
                  ? 'border-amber-300 bg-amber-50/60'
                  : draft.selected
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-surface-variant bg-surface'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(e) =>
                    updateDraft(draft.proposalId, {
                      selected: e.target.checked,
                    })
                  }
                  disabled={creating}
                  className="mt-1 h-4 w-4 accent-[#5c1219]"
                  aria-label={`Create ${draft.label}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-on-surface">
                      Page {draft.pageIndex + 1}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        confidencePct >= 70
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : confidencePct >= 45
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-surface-variant bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      <Icon name="insights" size={11} />
                      {confidencePct}% confidence
                    </span>
                    {draft.status === 'conflict' && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                        <Icon name="warning" size={11} />
                        Already mapped
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] text-on-surface-variant line-clamp-2">
                    {draft.label || draft.headerText || 'Detected course table'}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {draft.signals.map((signal) => (
                      <span
                        key={signal}
                        className="rounded-full border border-surface-variant bg-surface-container-low px-2 py-0.5 text-[10px] text-on-surface-variant"
                      >
                        {signal}
                      </span>
                    ))}
                    <span className="rounded-full border border-surface-variant bg-surface-container-low px-2 py-0.5 text-[10px] text-on-surface-variant">
                      {draft.rows.length} row
                      {draft.rows.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                      Year
                      <select
                        value={draft.year}
                        onChange={(e) =>
                          updateDraft(draft.proposalId, {
                            year: Number(e.target.value),
                          })
                        }
                        disabled={creating}
                        className="rounded-md border border-surface-variant bg-white px-2 py-1 text-xs font-semibold text-on-surface focus:border-primary focus:outline-none"
                      >
                        {YEAR_LEVELS.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                      Semester
                      <select
                        value={draft.semester}
                        onChange={(e) =>
                          updateDraft(draft.proposalId, {
                            semester: e.target.value as SemesterType,
                          })
                        }
                        disabled={creating}
                        className="rounded-md border border-surface-variant bg-white px-2 py-1 text-xs font-semibold text-on-surface focus:border-primary focus:outline-none"
                      >
                        {SEMESTERS.map((semester) => (
                          <option key={semester.value} value={semester.value}>
                            {semester.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draft.yearLevel == null || draft.semester == null ? (
                      <span className="text-[10px] italic text-on-surface-variant">
                        not printed near the table — confirm before creating
                      </span>
                    ) : null}
                  </div>

                  {conflict && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                      <Icon name="warning" size={12} />
                      {conflict}. Pick another semester or year.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {warnings.length > 0 && (
          <div className="rounded-lg border border-surface-variant bg-surface-container-low p-3 text-xs text-on-surface-variant">
            <p className="font-semibold text-on-surface">Detection notes</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {warnings.slice(0, 6).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            {warnings.length > 6 && (
              <p className="mt-1 italic">
                and {warnings.length - 6} more note
                {warnings.length - 6 === 1 ? '' : 's'}.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
