import { useQuery } from '@tanstack/react-query';
import Modal from '../../../components/ui/Modal';
import Icon from '../../../components/ui/Icon';
import {
  compareVersions,
  type ScheduleVersionSummary,
  type ScheduleVersionEntry,
  type VersionCompareResult,
} from '../../../api/schedule.api';

interface VersionCompareModalProps {
  open: boolean;
  onClose: () => void;
  versionA: ScheduleVersionSummary | null;
  versionB: ScheduleVersionSummary | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function entryLabel(e: ScheduleVersionEntry): string {
  const code = e.subject_code ?? '?';
  const section = e.section_code ?? '?';
  return `${code} · ${section}`;
}

function entryTime(e: ScheduleVersionEntry): string {
  const day = e.day_of_week ?? '?';
  const start = (e.start_time ?? '').slice(0, 5);
  const end = (e.end_time ?? '').slice(0, 5);
  return `${day} ${start}–${end}`;
}

function entryLocation(e: ScheduleVersionEntry): string {
  const room = e.room_number ?? '—';
  const faculty = e.faculty_name ?? '—';
  return `${room} · ${faculty}`;
}

export default function VersionCompareModal({
  open,
  onClose,
  versionA,
  versionB,
}: VersionCompareModalProps) {
  const canLoad = open && !!versionA && !!versionB;

  const { data, isLoading, error } = useQuery<VersionCompareResult>({
    queryKey: [
      'schedule-version-compare',
      versionA?.versionId,
      versionB?.versionId,
    ],
    queryFn: () => compareVersions(versionA!.versionId, versionB!.versionId),
    enabled: canLoad,
    staleTime: 60 * 1000,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compare versions"
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition"
        >
          Close
        </button>
      }
    >
      {isLoading && (
        <div className="py-12 text-center text-sm text-on-surface-variant">
          Loading comparison…
        </div>
      )}

      {error && (
        <div className="p-4 rounded bg-red-50 border border-red-200 text-sm text-red-800">
          Failed to load comparison: {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Header */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 border border-surface-variant rounded bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  <Icon name="history" size={11} />
                  v{data.versionA.versionNumber}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Before
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-2">
                {data.versionA.entryCount} entries ·{' '}
                {formatDateTime(data.versionA.lastModifiedAt)}
              </p>
              <p className="text-xs text-on-surface-variant">
                by {data.versionA.finalizedByName ?? 'unknown'}
              </p>
            </div>

            <div className="p-3 border border-surface-variant rounded bg-surface-container-lowest">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                  <Icon name="history" size={11} />
                  v{data.versionB.versionNumber}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  After
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-2">
                {data.versionB.entryCount} entries ·{' '}
                {formatDateTime(data.versionB.lastModifiedAt)}
              </p>
              <p className="text-xs text-on-surface-variant">
                by {data.versionB.finalizedByName ?? 'unknown'}
              </p>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
              +{data.added.length} added
            </span>
            <span className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
              −{data.removed.length} removed
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
              ~{data.moved.length} moved
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
              ={data.unchanged} unchanged
            </span>
          </div>

          {/* Added */}
          {data.added.length > 0 && (
            <CompareSection
              title="Added"
              tone="emerald"
              icon="add_circle"
              count={data.added.length}
              items={data.added.map((e) => ({
                primary: entryLabel(e),
                secondary: `${entryTime(e)} · ${entryLocation(e)}`,
              }))}
            />
          )}

          {/* Removed */}
          {data.removed.length > 0 && (
            <CompareSection
              title="Removed"
              tone="rose"
              icon="remove_circle"
              count={data.removed.length}
              items={data.removed.map((e) => ({
                primary: entryLabel(e),
                secondary: `${entryTime(e)} · ${entryLocation(e)}`,
              }))}
            />
          )}

          {/* Moved */}
          {data.moved.length > 0 && (
            <CompareSection
              title="Moved / changed"
              tone="amber"
              icon="swap_horiz"
              count={data.moved.length}
              items={data.moved.map((m) => ({
                primary: entryLabel(m.after),
                secondary: `${m.changes.join(', ')}`,
                detail: (
                  <div className="grid grid-cols-2 gap-2 mt-1.5 text-[11px] font-mono">
                    <div className="text-slate-500">
                      <div className="text-[9px] uppercase tracking-wider font-sans mb-0.5">
                        Before
                      </div>
                      <div>{entryTime(m.before)}</div>
                      <div>{entryLocation(m.before)}</div>
                    </div>
                    <div className="text-amber-800">
                      <div className="text-[9px] uppercase tracking-wider font-sans mb-0.5">
                        After
                      </div>
                      <div>{entryTime(m.after)}</div>
                      <div>{entryLocation(m.after)}</div>
                    </div>
                  </div>
                ),
              }))}
            />
          )}

          {data.added.length === 0 &&
            data.removed.length === 0 &&
            data.moved.length === 0 && (
              <div className="p-6 text-center border border-dashed border-surface-variant rounded">
                <Icon
                  name="check_circle"
                  size={32}
                  className="text-emerald-600 mx-auto mb-2"
                />
                <p className="text-sm font-semibold text-on-surface">
                  Identical
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  No differences between these two versions.
                </p>
              </div>
            )}
        </div>
      )}
    </Modal>
  );
}

// ────────────────────────────────────────────
// Subcomponent
// ────────────────────────────────────────────

interface CompareSectionProps {
  title: string;
  tone: 'emerald' | 'rose' | 'amber';
  icon: string;
  count: number;
  items: Array<{
    primary: string;
    secondary: string;
    detail?: React.ReactNode;
  }>;
}

function CompareSection({
  title,
  tone,
  icon,
  count,
  items,
}: CompareSectionProps) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : tone === 'rose'
      ? 'bg-rose-50 border-rose-200 text-rose-900'
      : 'bg-amber-50 border-amber-200 text-amber-900';

  const iconColor =
    tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'rose'
      ? 'text-rose-700'
      : 'text-amber-700';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon name={icon} size={16} className={iconColor} />
        <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
        <span className="text-xs text-on-surface-variant">({count})</span>
      </div>

      <ul
        className={`border rounded divide-y ${toneClass.replace('text-', 'divide-')}`}
      >
        {items.map((item, i) => (
          <li key={i} className={`px-3 py-2.5 ${toneClass}`}>
            <p className="text-xs font-semibold">{item.primary}</p>
            <p className="text-[11px] mt-0.5 opacity-90">{item.secondary}</p>
            {item.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}