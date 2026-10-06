import { useMemo } from 'react';
import type { ScheduleEntry, Day } from '../types';
import AgendaClassCard from './AgendaClassCard';
import { timeToMinutes } from '../utils/time.util';

interface Props {
  entries: ScheduleEntry[];
  onEntryClick: (entry: ScheduleEntry) => void;
}

const DAY_ORDER: Day[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const DAY_LABEL: Record<Day, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

export default function AgendaView({ entries, onEntryClick }: Props) {
  const grouped = useMemo(() => {
    const byDay = new Map<Day, ScheduleEntry[]>();
    for (const day of DAY_ORDER) byDay.set(day, []);
    for (const e of entries) {
      if (!byDay.has(e.day)) byDay.set(e.day, []);
      byDay.get(e.day)!.push(e);
    }
    // Sort each day by start time
    for (const list of byDay.values()) {
      list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }
    return byDay;
  }, [entries]);

  const days = DAY_ORDER.filter((d) => (grouped.get(d)?.length ?? 0) > 0);

  if (days.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        No classes to show.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {days.map((day) => {
        const list = grouped.get(day) ?? [];
        return (
          <section key={day}>
            <header className="flex items-center justify-between mb-2 px-1 sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm py-1.5 -mx-1 px-1">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                {DAY_LABEL[day]}
              </h2>
              <span className="text-[11px] font-semibold text-slate-400 tabular-nums">
                {list.length} {list.length === 1 ? 'class' : 'classes'}
              </span>
            </header>

            <div className="space-y-2">
              {list.map((e) => (
                <AgendaClassCard
                  key={e.id}
                  entry={e}
                  onClick={onEntryClick}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}