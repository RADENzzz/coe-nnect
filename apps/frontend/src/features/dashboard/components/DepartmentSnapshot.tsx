import Icon from '../../../components/ui/Icon';
import {
  computeDepartmentSnapshot,
  type DepartmentSnapshotStats,
} from '../utils/dashboard.utils';
import type { RawSchedule } from '../../../api/schedule.api';

type TileTone = 'default' | 'warning' | 'danger';

/**
 * Compact workload summary for the department head dashboard.
 * Counts only rows that are already visible to the department.
 *
 * Pass `stats` when the caller already computed the snapshot (the
 * dashboard reuses the same numbers for its attention strip); otherwise
 * the component derives them from `schedules`.
 */
export default function DepartmentSnapshot({
  schedules,
  stats: providedStats,
}: {
  schedules: RawSchedule[];
  stats?: DepartmentSnapshotStats;
}) {
  const stats = providedStats ?? computeDepartmentSnapshot(schedules);

  const tiles: Array<{
    icon: string;
    label: string;
    value: number;
    hint: string;
    tone: TileTone;
  }> = [
    {
      icon: 'person',
      label: 'Faculty assigned',
      value: stats.faculty,
      hint: 'Teaching this term',
      tone: 'default',
    },
    {
      icon: 'schedule',
      label: 'Weekly class hours',
      value: stats.weeklyHours,
      hint: 'Across all class blocks',
      tone: 'default',
    },
    {
      icon: 'meeting_room',
      label: 'Rooms in use',
      value: stats.rooms,
      hint: 'Assigned teaching spaces',
      tone: 'default',
    },
    {
      icon: 'group',
      label: 'Sections covered',
      value: stats.sections,
      hint: 'Distinct section codes',
      tone: 'default',
    },
    {
      icon: 'person_off',
      label: 'No instructor',
      value: stats.unassignedFaculty,
      hint:
        stats.unassignedFaculty > 0
          ? 'Assign faculty before publishing'
          : 'Every block has an instructor',
      tone: stats.unassignedFaculty > 0 ? 'danger' : 'default',
    },
    {
      icon: 'wrong_location',
      label: 'No room',
      value: stats.missingRoom,
      hint:
        stats.missingRoom > 0
          ? 'Assign a room before publishing'
          : 'Every block has a room',
      tone: stats.missingRoom > 0 ? 'warning' : 'default',
    },
  ];

  const toneClasses: Record<TileTone, string> = {
    default: 'bg-primary/10 text-primary',
    warning:
      'bg-amber-50 text-amber-700 dark:bg-[#f59e0b]/10 dark:text-[#fcd34d]',
    danger: 'bg-rose-50 text-rose-700 dark:bg-[#f43f5e]/10 dark:text-[#fda4af]',
  };

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClasses[tile.tone]}`}
            >
              <Icon name={tile.icon} size={16} filled />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider leading-tight">
              {tile.label}
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface tabular-nums">
            {tile.value}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-on-surface-variant">
            {tile.hint}
          </p>
        </div>
      ))}
    </div>
  );
}
