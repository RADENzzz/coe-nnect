import { useCallback, useState } from 'react';
import TimetableGrid from './components/TimetableGrid';
import type { ScheduleEntry } from './types';

// ── Mock data (replace with API later) ──
const MOCK_ENTRIES: ScheduleEntry[] = [
  {
    id: '1',
    subjectId: 'sub-1',
    subjectCode: 'CPE 101',
    subjectTitle: 'Programming Logic & Design',
    sectionId: 'sec-1',
    sectionCode: '1A',
    facultyId: 'fac-1',
    facultyName: 'Prof. A',
    roomId: 'rm-206',
    roomNumber: '206',
    day: 'MON',
    startTime: '08:30',
    endTime: '10:00',
    loadType: 'lecture',
    deptId: 'cpe',
    deptColor: '#800000',
  },
  {
    id: '2',
    subjectId: 'sub-2',
    subjectCode: 'CPE 102',
    subjectTitle: 'Computer Programming 2',
    sectionId: 'sec-1',
    sectionCode: '1A',
    facultyId: 'fac-2',
    facultyName: 'Prof. B',
    roomId: 'rm-205',
    roomNumber: '205',
    day: 'TUE',
    startTime: '13:00',
    endTime: '16:00',
    loadType: 'laboratory',
    deptId: 'cpe',
    deptColor: '#800000',
  },
];

export default function TimetablePage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>(MOCK_ENTRIES);

  const handleMove = useCallback(
    (entryId: string, newDay: string, newStartTime: string) => {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          // Keep same duration
          const startMin =
            Number(newStartTime.split(':')[0]) * 60 +
            Number(newStartTime.split(':')[1]);
          const duration =
            Number(e.endTime.split(':')[0]) * 60 +
            Number(e.endTime.split(':')[1]) -
            (Number(e.startTime.split(':')[0]) * 60 +
              Number(e.startTime.split(':')[1]));
          const endMin = startMin + duration;
          const newEnd = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(
            endMin % 60,
          ).padStart(2, '0')}`;
          return { ...e, day: newDay as any, startTime: newStartTime, endTime: newEnd };
        }),
      );
    },
    [],
  );

  const handleClick = useCallback((entry: ScheduleEntry) => {
    console.log('Clicked:', entry);
  }, []);

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-primary">Timetable</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Drag class blocks to reschedule. Conflicts are highlighted in red.
        </p>
      </div>

      <TimetableGrid
        entries={entries}
        onEntryMove={handleMove}
        onEntryClick={handleClick}
      />
    </div>
  );
}