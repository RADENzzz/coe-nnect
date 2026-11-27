import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import {
  fetchVersions,
  fetchPublishedVersions,
  fetchPublishedVersion,
  type PublishedVersionEntry,
  type PublishedVersionSummary,
  type ScheduleVersionSummary,
  type VersionSource,
} from '../../../api/schedule.api';
import { lockBodyScroll } from '@/lib/body-scroll-lock';

type SourceKind = VersionSource['kind'];

interface VersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  termId: string | undefined;
  /** Current term's semester; the published archive is scoped to it. */
  semester: string | null | undefined;
  /** Only a department head who owns the target department may reuse. */
  canReuse: boolean;
  /** Department scope applied to read-only published snapshot details. */
  scopeDeptId: string;
  /** Currently-viewed finalize version id, if in read-only version mode. */
  activeVersionId: string | null;
  /** Click a finalize version → switch the timetable to read-only view of it. */
  onViewVersion: (version: ScheduleVersionSummary) => void;
  /** Click "Back to live" → exit read-only version view. */
  onExitVersionView: () => void;
  /** Compare any published, finalize-history, or live source pair. */
  onCompare: (a: VersionSource, b: VersionSource) => void;
  /** Open the reuse flow for a published version (department heads only). */
  onReuse: (version: PublishedVersionSummary) => void;
}

interface SourceOption {
  id: string;
  label: string;
}

interface SourcePickerProps {
  label: string;
  kind: SourceKind;
  id: string;
  options: SourceOption[];
  onKindChange: (kind: SourceKind) => void;
  onIdChange: (id: string) => void;
}

const SOURCE_KINDS: SourceKind[] = ['published', 'history', 'live'];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Older same-semester versions are grouped by their captured school year. */
function groupBySchoolYear(
  versions: PublishedVersionSummary[],
): Array<[string, PublishedVersionSummary[]]> {
  const groups = new Map<string, PublishedVersionSummary[]>();
  for (const version of versions) {
    const year = version.schoolYear || 'Unknown school year';
    const bucket = groups.get(year) ?? [];
    bucket.push(version);
    groups.set(year, bucket);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
}

function publishedEntryLabel(entry: PublishedVersionEntry): string {
  return `${entry.subject_code ?? '?'} · ${entry.section_code ?? '?'}`;
}

function publishedEntryDetail(entry: PublishedVersionEntry): string {
  const day = entry.day_of_week ?? '?';
  const start = (entry.start_time ?? '').slice(0, 5);
  const end = (entry.end_time ?? '').slice(0, 5);
  const room = entry.external_room_name ?? entry.room_number ?? '—';
  const faculty = entry.external_faculty_name ?? entry.faculty_name ?? '—';
  return `${day} ${start}–${end} · ${room} · ${faculty}`;
}

function SourcePicker({
  label,
  kind,
  id,
  options,
  onKindChange,
  onIdChange,
}: SourcePickerProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <div role="group" aria-label={`${label} source type`} className="flex gap-1">
        {SOURCE_KINDS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={kind === candidate}
            onClick={() => onKindChange(candidate)}
            className={`px-2 py-1 text-[11px] font-semibold rounded border transition ${
              kind === candidate
                ? 'bg-primary text-on-primary border-primary'
                : 'border-surface-variant text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {candidate.charAt(0).toUpperCase() + candidate.slice(1)}
          </button>
        ))}
      </div>
      {kind === 'live' ? (
        <p className="text-[11px] text-on-surface-variant">
          Current live schedule for this term
        </p>
      ) : (
        <select
          aria-label={`${label} ${kind} version`}
          value={id}
          onChange={(event) => onIdChange(event.target.value)}
          disabled={options.length === 0}
          className="w-full text-xs border border-surface-variant rounded px-2 py-1.5 bg-white text-on-surface disabled:opacity-50"
        >
          {options.length === 0 && <option value="">No versions available</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

interface PublishedRowProps {
  version: PublishedVersionSummary;
  canReuse: boolean;
  onView: () => void;
  onCompare: () => void;
  onReuse: () => void;
}

function PublishedRow({
  version,
  canReuse,
  onView,
  onCompare,
  onReuse,
}: PublishedRowProps) {
  // The backend derives locked = stale || !term.isActive. Stale sources remain
  // reusable; only deactivated, non-stale source terms are blocked until the
  // term is reactivated.
  const canReuseVersion = !version.locked || version.stale;
  const reuseLabel = canReuseVersion
    ? `Reuse ${version.termName}`
    : `Reuse unavailable until ${version.termName} is reactivated`;

  return (
    <li className="px-5 py-3.5 transition hover:bg-surface-container-low">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-on-surface">
              {version.termName}
            </span>
            {version.stale && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                Stale — verify labels
              </span>
            )}
            {version.locked && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                Locked
              </span>
            )}
            <span className="text-[10px] text-on-surface-variant">
              {version.schoolYear}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            {version.entryCount} {version.entryCount === 1 ? 'entry' : 'entries'} ·
            updated {formatDateTime(version.updatedAt)}
          </p>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            Published {formatDateTime(version.publishedAt)}
            {version.deactivatedAt
              ? ` · deactivated ${formatDateTime(version.deactivatedAt)}`
              : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={onView}
          className="px-2.5 py-1 text-[11px] font-semibold border border-surface-variant rounded hover:bg-surface-container-low transition"
        >
          View
        </button>
        <button
          type="button"
          onClick={onCompare}
          className="px-2.5 py-1 text-[11px] font-semibold border border-surface-variant rounded hover:bg-surface-container-low transition"
        >
          Compare
        </button>
        {canReuse && (
          <button
            type="button"
            onClick={onReuse}
            disabled={!canReuseVersion}
            title={
              canReuseVersion
                ? undefined
                : 'Reactivate the source term before reusing'
            }
            aria-label={reuseLabel}
            className="px-2.5 py-1 text-[11px] font-semibold bg-primary text-on-primary rounded hover:bg-tertiary transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reuse
          </button>
        )}
      </div>
    </li>
  );
}

export default function VersionHistoryDrawer({
  open,
  onClose,
  termId,
  semester,
  canReuse,
  scopeDeptId,
  activeVersionId,
  onViewVersion,
  onExitVersionView,
  onCompare,
  onReuse,
}: VersionHistoryDrawerProps) {
  const [tab, setTab] = useState<'published' | 'history'>('published');
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [detailVersion, setDetailVersion] =
    useState<PublishedVersionSummary | null>(null);
  const [sourceAKind, setSourceAKind] = useState<SourceKind>('published');
  const [sourceBKind, setSourceBKind] = useState<SourceKind>('live');
  const [sourceAId, setSourceAId] = useState('');
  const [sourceBId, setSourceBId] = useState('');

  // Reset compare state when the drawer closes.
  useEffect(() => {
    if (!open) {
      setCompareMode(false);
      setSelected([]);
      setDetailVersion(null);
    }
  }, [open]);

  // Lock the page behind the drawer and restore the previous value on close.
  useEffect(() => {
    if (!open) return;
    const release = lockBodyScroll();
    return release;
  }, [open]);

  const {
    data: versions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['schedule-versions', termId],
    queryFn: () => fetchVersions(termId!),
    enabled: open && !!termId,
    staleTime: 15 * 1000,
  });

  // No school-year filter: older years are the point of the archive browser.
  const {
    data: publishedVersions = [],
    isLoading: publishedLoading,
    error: publishedError,
  } = useQuery({
    queryKey: ['published-versions', semester],
    queryFn: () => fetchPublishedVersions(semester ?? undefined),
    enabled: open && !!semester,
    staleTime: 15 * 1000,
  });

  const {
    data: publishedDetail,
    isLoading: detailLoading,
    error: detailError,
  } = useQuery({
    queryKey: ['published-version-detail', detailVersion?.versionId, scopeDeptId],
    queryFn: () =>
      fetchPublishedVersion(detailVersion!.versionId, scopeDeptId || undefined),
    enabled: !!detailVersion && tab === 'published',
    staleTime: 60 * 1000,
  });

  const sortedPublished = useMemo(
    () =>
      [...publishedVersions].sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      ),
    [publishedVersions],
  );
  const currentPublished = useMemo(
    () => sortedPublished.filter((version) => !!termId && version.termId === termId),
    [sortedPublished, termId],
  );
  const olderGroups = useMemo(
    () =>
      groupBySchoolYear(
        sortedPublished.filter((version) => version.termId !== termId),
      ),
    [sortedPublished, termId],
  );

  const publishedOptions = useMemo(
    () =>
      sortedPublished.map((version) => ({
        id: version.versionId,
        label: `${version.termName} · ${version.schoolYear}`,
      })),
    [sortedPublished],
  );
  const historyOptions = useMemo(
    () =>
      versions.map((version) => ({
        id: version.versionId,
        label: `v${version.versionNumber} · ${formatDateTime(version.lastModifiedAt)}`,
      })),
    [versions],
  );
  const liveOptions = useMemo(
    () => (termId ? [{ id: termId, label: 'Current live schedule' }] : []),
    [termId],
  );

  const aOptions =
    sourceAKind === 'published'
      ? publishedOptions
      : sourceAKind === 'history'
      ? historyOptions
      : liveOptions;
  const bOptions =
    sourceBKind === 'published'
      ? publishedOptions
      : sourceBKind === 'history'
      ? historyOptions
      : liveOptions;

  useEffect(() => {
    setSourceAId((previous) =>
      aOptions.some((option) => option.id === previous)
        ? previous
        : aOptions[0]?.id ?? '',
    );
    setSourceBId((previous) =>
      bOptions.some((option) => option.id === previous)
        ? previous
        : bOptions[0]?.id ?? '',
    );
  }, [aOptions, bOptions]);

  const canCompare = useMemo(() => selected.length === 2, [selected]);
  const sourceA = sourceAId ? { kind: sourceAKind, id: sourceAId } : null;
  const sourceB = sourceBId ? { kind: sourceBKind, id: sourceBId } : null;

  const handleToggleSelect = (versionId: string) => {
    setSelected((previous) => {
      if (previous.includes(versionId)) {
        return previous.filter((id) => id !== versionId);
      }
      if (previous.length >= 2) {
        // Replace the oldest selection with the new one.
        return [previous[1], versionId];
      }
      return [...previous, versionId];
    });
  };

  const handleHistoryCompare = () => {
    if (!canCompare) return;
    const [idA, idB] = selected;
    const a = versions.find((version) => version.versionId === idA);
    const b = versions.find((version) => version.versionId === idB);
    if (!a || !b) return;
    // Order by version_number so A is always the older one.
    if (a.versionNumber <= b.versionNumber) {
      onCompare(
        { kind: 'history', id: a.versionId },
        { kind: 'history', id: b.versionId },
      );
    } else {
      onCompare(
        { kind: 'history', id: b.versionId },
        { kind: 'history', id: a.versionId },
      );
    }
  };

  const comparePublished = (version: PublishedVersionSummary) => {
    let target = sourceB;
    if (!target || (target.kind === 'published' && target.id === version.versionId)) {
      target = termId ? { kind: 'live', id: termId } : null;
    }
    if (target) {
      onCompare({ kind: 'published', id: version.versionId }, target);
    }
  };

  // Portal out of the route wrapper so the retained page-roll transform cannot
  // anchor the fixed drawer to the scrolled page.
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Published versions and finalize history"
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-white shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-variant">
          <div className="flex items-center gap-2">
            <Icon name="history" size={20} className="text-primary" />
            <h2 className="text-base font-semibold text-on-surface">
              Version archive
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-container-low transition"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Tabs keep finalize history distinct from the published archive. */}
        <div
          role="tablist"
          aria-label="Version sections"
          className="flex gap-1 px-5 pt-3 border-b border-surface-variant"
        >
          <button
            type="button"
            role="tab"
            id="version-tab-published"
            aria-controls="version-panel-published"
            aria-selected={tab === 'published'}
            onClick={() => {
              setTab('published');
              setDetailVersion(null);
            }}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition ${
              tab === 'published'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Published
          </button>
          <button
            type="button"
            role="tab"
            id="version-tab-history"
            aria-controls="version-panel-history"
            aria-selected={tab === 'history'}
            onClick={() => {
              setTab('history');
              setDetailVersion(null);
            }}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition ${
              tab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Finalize history
          </button>
        </div>

        {tab === 'published' ? (
          <div
            role="tabpanel"
            id="version-panel-published"
            aria-labelledby="version-tab-published"
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Cross-source compare chips — read-only, any term. */}
            <div className="px-5 py-3 border-b border-surface-variant bg-surface-container-lowest space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <SourcePicker
                  label="Before (A)"
                  kind={sourceAKind}
                  id={sourceAId}
                  options={aOptions}
                  onKindChange={setSourceAKind}
                  onIdChange={setSourceAId}
                />
                <SourcePicker
                  label="After (B)"
                  kind={sourceBKind}
                  id={sourceBId}
                  options={bOptions}
                  onKindChange={setSourceBKind}
                  onIdChange={setSourceBId}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (sourceA && sourceB) onCompare(sourceA, sourceB);
                }}
                disabled={!sourceA || !sourceB}
                className="w-full text-xs font-semibold px-3 py-1.5 bg-primary text-on-primary rounded hover:bg-tertiary transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Compare selected sources
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {publishedLoading && (
                <div className="p-6 text-center text-sm text-on-surface-variant">
                  Loading published versions…
                </div>
              )}

              {publishedError && (
                <div className="p-4 m-4 rounded bg-red-50 border border-red-200 text-xs text-red-800">
                  Failed to load published versions:{' '}
                  {(publishedError as Error).message}
                </div>
              )}

              {!publishedLoading &&
                !publishedError &&
                sortedPublished.length === 0 && (
                  <div className="p-6 text-center">
                    <p className="text-sm font-semibold text-on-surface">
                      No published versions for this semester
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      A version is saved when the Dean approves a publish or a
                      term is deactivated.
                    </p>
                  </div>
                )}

              {!publishedLoading && !publishedError && currentPublished.length > 0 && (
                <section
                  aria-labelledby="published-current-heading"
                  className="border-b border-surface-variant"
                >
                  <h3
                    id="published-current-heading"
                    className="px-5 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-primary"
                  >
                    Current term
                  </h3>
                  <ul className="divide-y divide-surface-variant">
                    {currentPublished.map((version) => (
                      <PublishedRow
                        key={version.versionId}
                        version={version}
                        canReuse={canReuse}
                        onView={() => setDetailVersion(version)}
                        onCompare={() => comparePublished(version)}
                        onReuse={() => onReuse(version)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {!publishedLoading &&
                !publishedError &&
                olderGroups.map(([schoolYear, versionsForYear]) => (
                  <section
                    key={schoolYear}
                    aria-labelledby={`published-year-${schoolYear}`}
                    className="border-b border-surface-variant"
                  >
                    <div className="px-5 pt-4 pb-1 flex items-center justify-between gap-2">
                      <h3
                        id={`published-year-${schoolYear}`}
                        className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"
                      >
                        {schoolYear}
                      </h3>
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        Verify before reuse
                      </span>
                    </div>
                    <ul className="divide-y divide-surface-variant">
                      {versionsForYear.map((version) => (
                        <PublishedRow
                          key={version.versionId}
                          version={version}
                          canReuse={canReuse}
                          onView={() => setDetailVersion(version)}
                          onCompare={() => comparePublished(version)}
                          onReuse={() => onReuse(version)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          </div>
        ) : (
          <div
            role="tabpanel"
            id="version-panel-history"
            aria-labelledby="version-tab-history"
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Toolbar */}
            <div className="px-5 py-3 border-b border-surface-variant flex items-center justify-between gap-2 bg-surface-container-lowest">
              {!compareMode ? (
                <>
                  <p className="text-xs text-on-surface-variant">
                    {versions.length}{' '}
                    {versions.length === 1 ? 'version' : 'versions'} for this term
                  </p>
                  <button
                    type="button"
                    onClick={() => setCompareMode(true)}
                    disabled={versions.length < 2}
                    className="text-xs font-semibold px-3 py-1.5 border border-surface-variant rounded hover:bg-surface-container-low transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Compare
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-on-surface-variant">
                    {selected.length}/2 selected
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCompareMode(false);
                        setSelected([]);
                      }}
                      className="text-xs font-semibold px-3 py-1.5 border border-surface-variant rounded hover:bg-surface-container-low transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleHistoryCompare}
                      disabled={!canCompare}
                      className="text-xs font-semibold px-3 py-1.5 bg-primary text-on-primary rounded hover:bg-tertiary transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Compare
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="p-6 text-center text-sm text-on-surface-variant">
                  Loading versions…
                </div>
              )}

              {error && (
                <div className="p-4 m-4 rounded bg-red-50 border border-red-200 text-xs text-red-800">
                  Failed to load versions: {(error as Error).message}
                </div>
              )}

              {!isLoading && !error && versions.length === 0 && (
                <div className="p-6 text-center">
                  <Icon
                    name="history_toggle_off"
                    size={40}
                    className="text-on-surface-variant mx-auto mb-3"
                  />
                  <p className="text-sm font-semibold text-on-surface">
                    No versions yet
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    A version is created automatically when a schedule entry is
                    finalized. Finalize an entry to create v1.
                  </p>
                </div>
              )}

              {!isLoading && !error && versions.length > 0 && (
                <ul className="divide-y divide-surface-variant">
                  {versions.map((version) => {
                    const isActive = version.versionId === activeVersionId;
                    const isSelected = selected.includes(version.versionId);

                    return (
                      <li
                        key={version.versionId}
                        className={`px-5 py-4 transition ${
                          isActive
                            ? 'bg-primary/5'
                            : 'hover:bg-surface-container-low'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {compareMode && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  handleToggleSelect(version.versionId)
                                }
                                className="mt-1 accent-primary"
                                aria-label={`Select version ${version.versionNumber}`}
                              />
                            )}

                            <button
                              type="button"
                              onClick={() => !compareMode && onViewVersion(version)}
                              disabled={compareMode}
                              className={`flex-1 text-left min-w-0 ${
                                compareMode
                                  ? 'cursor-default'
                                  : 'cursor-pointer hover:opacity-80'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${
                                    isActive
                                      ? 'bg-primary text-on-primary'
                                      : 'bg-primary/10 text-primary'
                                  }`}
                                >
                                  <Icon name="history" size={11} />
                                  v{version.versionNumber}
                                </span>
                                {isActive && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                    Viewing
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                                {version.entryCount}{' '}
                                {version.entryCount === 1 ? 'entry' : 'entries'} ·{' '}
                                {formatDateTime(version.lastModifiedAt)}
                              </p>

                              <p className="text-xs text-on-surface-variant mt-0.5">
                                Finalized by{' '}
                                <span className="font-medium text-on-surface">
                                  {version.finalizedByName ?? 'unknown'}
                                </span>
                              </p>
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {activeVersionId && tab === 'history' && !compareMode && (
          <div className="px-5 py-3 border-t border-surface-variant bg-amber-50">
            <button
              type="button"
              onClick={() => {
                onExitVersionView();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-900 text-sm font-semibold rounded hover:bg-amber-100 transition"
            >
              <Icon name="arrow_back" size={16} />
              Back to live schedule
            </button>
          </div>
        )}
      </aside>

      {/* Read-only published snapshot detail. */}
      <Modal
        open={!!detailVersion}
        onClose={() => setDetailVersion(null)}
        title={`Published version · ${detailVersion?.termName ?? ''}`}
        description={
          detailVersion
            ? `${detailVersion.schoolYear} · ${formatDateTime(detailVersion.publishedAt)}`
            : undefined
        }
        size="lg"
        footer={
          <button
            type="button"
            onClick={() => setDetailVersion(null)}
            className="px-5 py-2 text-sm font-semibold bg-primary text-white hover:opacity-90 transition"
          >
            Close
          </button>
        }
      >
        {detailLoading && (
          <div className="py-10 text-center text-sm text-on-surface-variant">
            Loading snapshot…
          </div>
        )}
        {detailError && (
          <div className="p-4 rounded bg-red-50 border border-red-200 text-sm text-red-800">
            Failed to load snapshot: {(detailError as Error).message}
          </div>
        )}
        {publishedDetail && (
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              {publishedDetail.entryCount}{' '}
              {publishedDetail.entryCount === 1 ? 'entry' : 'entries'} · updated{' '}
              {formatDateTime(publishedDetail.updatedAt)}
              {publishedDetail.stale ? ' · stale — verify labels' : ''}
            </p>
            {publishedDetail.entries.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                No entries captured in this version.
              </p>
            ) : (
              <ul className="divide-y divide-surface-variant border border-surface-variant rounded">
                {publishedDetail.entries.map((entry, index) => (
                  <li key={`${entry.schedule_id ?? 'entry'}-${index}`} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-on-surface">
                        {publishedEntryLabel(entry)}
                      </p>
                      <span className="text-[10px] font-semibold uppercase text-on-surface-variant">
                        {entry.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      {publishedEntryDetail(entry)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </>,
    document.body,
  );
}
