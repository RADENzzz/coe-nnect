import Icon from '../../../components/ui/Icon';
import {
  computeDepartmentSnapshot,
  type DepartmentSnapshotStats,
} from '../utils/dashboard.utils';
import type { RawSchedule } from '../../../api/schedule.api';

/**
 * Department workload line.
 *
 * Faculty, rooms, sections, and weekly teaching hours in one compact row.
 * Assignment gaps are the only thing that gets a button, because they are
 * the only item here that blocks publishing.
 */
export default function DepartmentSnapshot({
  schedules,
  stats: providedStats,
  onReviewGaps,
}: {
  schedules: RawSchedule[];
  stats?: DepartmentSnapshotStats;
  onReviewGaps?: () => void;
}) {
  const stats = providedStats ?? computeDepartmentSnapshot(schedules);

  const items = [
    { label: 'faculty', value: stats.faculty },
    { label: 'rooms', value: stats.rooms },
    { label: 'sections', value: stats.sections },
    { label: 'hrs/week', value: stats.weeklyHours },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-on-surface-variant">
      <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider">
        <Icon name="corporate_fare" size={12} />
        Workload
      </span>
      {items.map((item, index) => (
        <span key={item.label} className="inline-flex items-baseline gap-1">
          <strong className="font-semibold text-on-surface tabular-nums">
            {item.value}
          </strong>
          {item.label}
          {index < items.length - 1 && (
            <span
              className="ml-2 text-on-surface-variant/40"
              aria-hidden="true"
            >
              ·
            </span>
          )}
        </span>
      ))}

      <span className="ml-auto">
        {stats.gaps > 0 ? (
          <button
            type="button"
            onClick={onReviewGaps}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <Icon name="warning" size={11} />
            {stats.gaps} assignment gap{stats.gaps === 1 ? '' : 's'}
            <Icon name="arrow_forward" size={10} />
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
            <Icon name="check_circle" size={11} />
            Assignments complete
          </span>
        )}
      </span>
    </div>
  );
}
