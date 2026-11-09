import { useMemo } from 'react';
import Icon from '../../../components/ui/Icon';
import type { RawSchedule } from '../../../api/schedule.api';
import {
  scheduleDay,
  scheduleEnd,
  scheduleStart,
  timeToMinutes,
} from '../utils/dashboard.utils';

/**
 * Compact workload summary for the department head dashboard.
 * Counts only rows that are already visible to the department.
 */
export default function DepartmentSnapshot({
  schedules,
}: {
  schedules: RawSchedule[];
}) {
  const stats = useMemo(() => {
    const faculty = new Set<string>();
    const rooms = new Set<string>();
    const sections = new Set<string>();
    let minutes = 0;

    for (const row of schedules) {
      if (row.facultyId) faculty.add(`f:${row.facultyId}`);
      else if (row.externalFacultyName) {
        faculty.add(`x:${row.externalFacultyName.trim().toLowerCase()}`);
      }

      if (row.roomId) rooms.add(`r:${row.roomId}`);
      else if (row.externalRoomName) {
        rooms.add(`x:${row.externalRoomName.trim().toLowerCase()}`);
      }

      if (row.section) sections.add(row.section.trim());
      if (scheduleDay(row)) {
        const start = timeToMinutes(scheduleStart(row));
        const end = timeToMinutes(scheduleEnd(row));
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          minutes += end - start;
        }
      }
    }

    return {
      faculty: faculty.size,
      rooms: rooms.size,
      sections: sections.size,
      weeklyHours: Math.round((minutes / 60) * 10) / 10,
    };
  }, [schedules]);

  const tiles = [
    {
      icon: 'person',
      label: 'Faculty assigned',
      value: stats.faculty,
      hint: 'Teaching this term',
    },
    {
      icon: 'schedule',
      label: 'Weekly class hours',
      value: stats.weeklyHours,
      hint: 'Across all class blocks',
    },
    {
      icon: 'meeting_room',
      label: 'Rooms in use',
      value: stats.rooms,
      hint: 'Assigned teaching spaces',
    },
    {
      icon: 'group',
      label: 'Sections covered',
      value: stats.sections,
      hint: 'Distinct section codes',
    },
  ];

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 text-slate-500">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name={tile.icon} size={16} filled />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {tile.label}
            </span>
          </div>
          <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {tile.value}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}
