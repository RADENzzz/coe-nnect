import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import {
  createProspectusPdfTable,
  detectProspectusPdfTables,
} from '@/api/prospectus-pdfs.api';
import { useSemesterTypes } from '@/hooks/use-semester-types';
import { matchSemesterType, type SemesterLike } from '@/lib/semester-match';
import type {
  DetectedTableProposal,
  ProspectusPdfTable,
  SemesterType,
  TableKind,
} from '../types';
import { COLUMN_LABELS, COLUMN_ORDER } from '../types';
import {
  mergeCatalogSeededDrafts,
  partitionSelectedDrafts,
} from '../utils/draftSelection';
import { isElectiveGroupHeading } from '../utils/rowDetection';
import { maxTables, YEAR_LEVELS } from '../constants';

interface DraftProposal extends DetectedTableProposal {
  selected: boolean;
  year: number;
  /** Null until a recognized catalog type is chosen (required for regular tables). */
  semester: SemesterType | null;
  tableKind: TableKind;
  /** Parser text that did not resolve to a catalog type. */
  unrecognizedSemester: string | null;
  /** Elective group name typed by the user before creating. */
  name: string;
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
  semesters: string[],
  preferredYear?: number | null,
): { year: number; semester: SemesterType } {
  const isTaken = (year: number, semester: SemesterType) =>
    taken.some((t) => t.yearLevel === year && t.semester === semester);

  const years = preferredYear
    ? [preferredYear, ...YEAR_LEVELS.filter((y) => y !== preferredYear)]
    : [...YEAR_LEVELS];
  for (const year of years) {
    for (const semester of semesters) {
      if (!isTaken(year, semester)) return { year, semester };
    }
  }
  return { year: YEAR_LEVELS[0], semester: semesters[0] ?? '' };
}

/**
 * Electives are the tables that do not follow the six-column curriculum
 * contract. A proposal that is missing a role can never be created as a
 * regular table (the backend requires all six), so default it to elective
 * even when a year/term heading happened to be printed nearby. A full
 * six-role proposal without a year/term stays regular and gets a guessed
 * year/term for the user to confirm.
 */
function proposalLooksElective(proposal: DetectedTableProposal): boolean {
  const roles = new Set(proposal.columns.map((column) => column.role));
  if (roles.size < 6 || !roles.has('prereq')) return true;
  return proposal.yearLevel == null && proposal.semester == null;
}

function seedDrafts(
  proposals: DetectedTableProposal[],
  existing: ProspectusPdfTable[],
  semesters: string[],
  types: SemesterLike[],
): DraftProposal[] {
  const assigned: { yearLevel: number; semester: SemesterType }[] = existing
    .filter(
      (
        table,
      ): table is ProspectusPdfTable & {
        yearLevel: number;
        semester: SemesterType;
      } =>
        (table.tableKind ?? 'regular') === 'regular' &&
        table.yearLevel != null &&
        table.semester != null,
    )
    .map((table) => ({
      yearLevel: table.yearLevel,
      semester: table.semester,
    }));

  return proposals.map((proposal) => {
    const tableKind: TableKind = proposalLooksElective(proposal)
      ? 'elective'
      : 'regular';
    const detectedYear = proposal.yearLevel;
    let year = detectedYear ?? YEAR_LEVELS[0];
    const matched = proposal.semester
      ? matchSemesterType(proposal.semester, types)
      : null;
    let unrecognizedSemester =
      proposal.semester && !matched ? proposal.semester : null;
    let semester: SemesterType | null = matched?.code ?? null;

    if (tableKind === 'elective') {
      // Electives are not tied to a year/term, so the semester is never sent.
      semester = null;
      unrecognizedSemester = null;
    } else if (unrecognizedSemester) {
      // Leave the type unset. The user must pick one; no hard-coded fallback.
    } else if (detectedYear != null && semester != null) {
      // Keep the parser's inference even when it collides — the user needs
      // to see the conflict, not have it silently replaced.
    } else if (detectedYear != null) {
      semester =
        firstFreePair(assigned, semesters, detectedYear).semester || null;
    } else {
      const free = firstFreePair(assigned, semesters);
      year = free.year;
      semester = free.semester || null;
    }

    // Only regular tables reserve a year/term; electives may repeat freely.
    if (tableKind === 'regular' && semester) {
      assigned.push({ yearLevel: year, semester });
    }

    return {
      ...proposal,
      selected: proposal.status === 'new',
      year,
      semester,
      tableKind,
      unrecognizedSemester,
      name:
        tableKind === 'elective' && isElectiveGroupHeading(proposal.label)
          ? proposal.label
          : '',
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
  const { activeTypes, types, options, shortLabelFor } = useSemesterTypes();
  const [drafts, setDrafts] = useState<DraftProposal[]>([]);
  const [rawProposals, setRawProposals] = useState<DetectedTableProposal[]>([]);
  const editedProposalIdsRef = useRef<Set<string>>(new Set());
  const seededCatalogKeyRef = useRef('');
  const catalogKey = `${types.map((t) => t.code).join('|')}:${activeTypes
    .map((t) => t.code)
    .join('|')}`;
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
        maxTables: maxTables(activeTypes.length),
      });
      setRawProposals(result.proposals);
      setDrafts(
        seedDrafts(
          result.proposals,
          existingTables,
          activeTypes.map((t) => t.code),
          types,
        ),
      );
      editedProposalIdsRef.current = new Set();
      seededCatalogKeyRef.current = catalogKey;
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
  }, [pdfId, existingTables, activeTypes, types, catalogKey]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDrafts([]);
      setWarnings([]);
      setError(null);
      void runDetect();
    }
    wasOpenRef.current = open;
  }, [open, runDetect]);

  // Detection may finish before the catalog query does. Re-resolve untouched
  // drafts when types arrive or change; dean edits are keyed by proposal ID.
  useEffect(() => {
    if (!scanned || rawProposals.length === 0) return;
    if (seededCatalogKeyRef.current === catalogKey) return;
    seededCatalogKeyRef.current = catalogKey;

    const freshDrafts = seedDrafts(
      rawProposals,
      existingTables,
      activeTypes.map((t) => t.code),
      types,
    );
    const editedProposalIds = editedProposalIdsRef.current;
    setDrafts((prev) =>
      mergeCatalogSeededDrafts(prev, freshDrafts, editedProposalIds),
    );
    // `activeTypes` and `types` are fresh arrays on each render; catalogKey
    // carries the values that matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey, scanned, rawProposals]);

  const existingPairs = useMemo(
    () =>
      new Set(
        existingTables
          .filter(
            (
              table,
            ): table is ProspectusPdfTable & {
              yearLevel: number;
              semester: SemesterType;
            } =>
              (table.tableKind ?? 'regular') === 'regular' &&
              table.yearLevel != null &&
              table.semester != null,
          )
          .map((table) => pairKey(table.yearLevel, table.semester)),
      ),
    [existingTables],
  );

  const selectedPairCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const draft of drafts) {
      if (!draft.selected || draft.tableKind === 'elective') continue;
      // A regular table without all six roles or a semester cannot be
      // created, so it must not reserve a year/term and block a valid one.
      const roles = new Set(draft.columns.map((column) => column.role));
      if (roles.size !== 6 || !draft.semester) continue;
      const key = pairKey(draft.year, draft.semester);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [drafts]);

  const issueFor = (
    draft: DraftProposal,
  ): { kind: 'conflict' | 'invalid'; message: string } | null => {
    // Electives are optioned subjects and may repeat for any year/term.
    if (draft.tableKind === 'elective') return null;

    if (!draft.semester) {
      return {
        kind: 'invalid',
        message: draft.unrecognizedSemester
          ? `Not recognized: ${draft.unrecognizedSemester}. Pick a semester for Year ${draft.year} before creating this table.`
          : `Pick a semester for Year ${draft.year} before creating this table.`,
      };
    }

    const roles = new Set(draft.columns.map((column) => column.role));
    if (roles.size !== 6) {
      return {
        kind: 'invalid',
        message: `This proposal has ${roles.size} column${
          roles.size === 1 ? '' : 's'
        }, but regular tables need all six. Keep it elective or draw the table manually.`,
      };
    }

    const key = pairKey(draft.year, draft.semester);
    const semesterLabel = shortLabelFor(draft.semester);
    if (existingPairs.has(key)) {
      return {
        kind: 'conflict',
        message: `Year ${draft.year} ${semesterLabel} is already mapped. Pick another semester or year.`,
      };
    }
    if ((selectedPairCounts.get(key) ?? 0) > 1) {
      return {
        kind: 'conflict',
        message: `Another selected proposal also uses Year ${draft.year} ${semesterLabel}. Pick another semester or year.`,
      };
    }
    return null;
  };

  const { ready, blocking } = partitionSelectedDrafts(drafts, issueFor);

  const updateDraft = (
    proposalId: string,
    patch: Partial<
      Pick<
        DraftProposal,
        'selected' | 'year' | 'semester' | 'tableKind' | 'name'
      >
    >,
  ) => {
    editedProposalIdsRef.current.add(proposalId);
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.proposalId === proposalId ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const handleCreate = async () => {
    if (blocking.length > 0 || ready.length === 0) return;
    setCreating(true);
    setError(null);
    const created: ProspectusPdfTable[] = [];
    const createdIds = new Set<string>();

    for (const draft of ready) {
      try {
        const table = await createProspectusPdfTable(pdfId, {
          year_level: draft.tableKind === 'elective' ? null : draft.year,
          semester: draft.tableKind === 'elective' ? null : draft.semester,
          table_kind: draft.tableKind,
          // Only electives use a group name. The parser's proposal label is
          // year/term text for regular tables, so it is not stored there.
          label:
            draft.tableKind === 'elective'
              ? draft.name.trim().slice(0, 200) || undefined
              : undefined,
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
            disabled={creating || blocking.length > 0 || ready.length === 0}
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
              : blocking.length > 0
                ? `Resolve ${blocking.length} issue${blocking.length === 1 ? '' : 's'}`
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
              onClick={() => {
                setDrafts((prev) => {
                  // This action changes every draft's `selected` field.
                  editedProposalIdsRef.current = new Set(
                    prev.map((draft) => draft.proposalId),
                  );
                  return prev.map((draft) => ({
                    ...draft,
                    selected:
                      draft.status === 'new' && issueFor(draft) == null,
                  }));
                });
              }}
              className="ml-auto text-xs font-semibold text-primary hover:underline"
            >
              Select all without conflicts
            </button>
          </div>
        )}

        {drafts.map((draft) => {
          const issue = issueFor(draft);
          const conflict = issue != null;
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
                    {issue?.kind === 'conflict' && (
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

                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      Columns
                    </span>
                    {COLUMN_ORDER.filter((role) =>
                      draft.columns.some((column) => column.role === role),
                    ).map((role) => (
                      <span
                        key={role}
                        className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary"
                      >
                        {COLUMN_LABELS[role]}
                      </span>
                    ))}
                    {draft.columns.length === 0 && (
                      <span className="text-[10px] italic text-on-surface-variant">
                        none detected
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                      Type
                      <select
                        value={draft.tableKind}
                        onChange={(e) =>
                          updateDraft(draft.proposalId, {
                            tableKind: e.target.value as TableKind,
                          })
                        }
                        disabled={creating}
                        className="rounded-md border border-surface-variant bg-white px-2 py-1 text-xs font-semibold text-on-surface focus:border-primary focus:outline-none"
                      >
                        <option value="regular">Regular</option>
                        <option value="elective">Elective</option>
                      </select>
                    </label>
                    {draft.tableKind === 'elective' ? (
                      <span className="text-[10px] italic text-on-surface-variant">
                        Not tied to a year/term — assign it later.
                      </span>
                    ) : (
                      <>
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
                            value={draft.semester ?? ''}
                            onChange={(e) =>
                              updateDraft(draft.proposalId, {
                                semester: e.target.value || null,
                              })
                            }
                            disabled={creating}
                            className="rounded-md border border-surface-variant bg-white px-2 py-1 text-xs font-semibold text-on-surface focus:border-primary focus:outline-none"
                          >
                            <option value="" disabled>
                              {draft.unrecognizedSemester
                                ? 'Pick a semester'
                                : 'Select semester'}
                            </option>
                            {options(draft.semester).map((semester) => (
                              <option key={semester.code} value={semester.code}>
                                {semester.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {draft.yearLevel == null ||
                        (draft.semester == null &&
                          !draft.unrecognizedSemester) ? (
                          <span className="text-[10px] italic text-on-surface-variant">
                            not printed near the table — confirm before creating
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>

                  {draft.tableKind === 'elective' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">
                        Group name
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) =>
                            updateDraft(draft.proposalId, {
                              name: e.target.value,
                            })
                          }
                          disabled={creating}
                          maxLength={200}
                          placeholder="e.g. SOFTWARE DEVELOPMENT"
                          className="w-56 rounded-md border border-surface-variant bg-white px-2 py-1 text-xs font-semibold text-on-surface focus:border-primary focus:outline-none"
                        />
                      </label>
                      <span className="text-[10px] italic text-on-surface-variant">
                        Optional. Shown above the table.
                      </span>
                    </div>
                  )}

                  {issue && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                      <Icon
                        name={issue.kind === 'invalid' ? 'error' : 'warning'}
                        size={12}
                      />
                      {issue.message}
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
