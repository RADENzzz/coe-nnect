import { useMemo } from 'react';
import Icon from '../../../components/ui/Icon';
import type { RawSchedule } from '../../../api/schedule.api';
import {
  DAY_ABBR_TO_LABEL,
  DAY_FULL_NAMES,
  fmtTime,
  scheduleDay,
  scheduleStart,
  scheduleEnd,
  timeToMinutes,
} from '../utils/dashboard.utils';

export default function TodayScheduleStrip({
  schedules,
  now,
  onOpenTimetable,
}: {
  schedules: RawSchedule[];
  now: Date;
  onOpenTimetable: () => void;
}) {
  const todayName = DAY_FULL_NAMES[now.getDay()];
  const todayShort = DAY_ABBR_TO_LABEL[todayName] ?? todayName;

  const todaySchedules = useMemo(
    () =>
      schedules
        .filter((s) => {
          const d = scheduleDay(s);
          return (
            d === todayName ||
            d === todayShort.toUpperCase() ||
            DAY_ABBR_TO_LABEL[d] === todayShort
          );
        })
        .sort(
          (a, b) =>
            timeToMinutes(scheduleStart(a) || '00:00') -
            timeToMinutes(scheduleStart(b) || '00:00'),
        ),
    [schedules, todayName, todayShort],
  );

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const upNext = todaySchedules.find(
    (s) => timeToMinutes(scheduleEnd(s) || '23:59') >= nowMin,
  );
  const upNextStart = upNext
    ? timeToMinutes(scheduleStart(upNext) || '23:59')
    : null;
  const minutesUntilUpNext =
    upNextStart !== null && upNextStart >= nowMin
      ? upNextStart - nowMin
      : null;
  const upNextLabel =
    minutesUntilUpNext !== null && minutesUntilUpNext <= 120
      ? `Up next · ${minutesUntilUpNext}m`
      : 'Up next';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/70 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold text-on-surface">Today</h3>
          <span className="text-[11px] text-on-surface-variant">
            {todayName}
          </span>
        </div>
        <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant tabular-nums">
          {todaySchedules.length} class
          {todaySchedules.length === 1 ? '' : 'es'}
        </span>
      </div>

      {todaySchedules.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <Icon
            name="event_available"
            size={22}
            className="text-emerald-500"
          />
          <p className="text-sm font-medium text-on-surface">No classes today</p>
          <p className="text-xs text-on-surface-variant">
            Nothing scheduled for your department.
          </p>
        </div>
      ) : (
        <div className="flex-1 divide-y divide-outline-variant/50">
          {todaySchedules.slice(0, 4).map((s) => {
            const start = scheduleStart(s);
            const end = scheduleEnd(s);
            const isUpNext = upNext?.scheduleId === s.scheduleId;
            const isPast = timeToMinutes(end || '23:59') < nowMin;

            return (
              <button
                key={s.scheduleId}
                onClick={onOpenTimetable}
                className={`relative flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors focus:outline-none focus-visible:bg-surface-container-low ${
                  isPast
                    ? 'opacity-50'
                    : isUpNext
                    ? 'bg-primary/[0.04] hover:bg-primary/[0.07]'
                    : 'hover:bg-surface-container-low'
                }`}
              >
                {isUpNext && (
                  <span
                    className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
                <div className="w-12 shrink-0 pt-0.5">
                  <div className="text-xs font-bold text-on-surface tabular-nums">
                    {fmtTime(start)}
                  </div>
                  <div className="text-[10px] text-on-surface-variant tabular-nums">
                    {fmtTime(end)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-on-surface">
                      {s.subject?.subjectCode ?? '—'}
                    </span>
                    {isUpNext && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-primary">
                        {upNextLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-on-surface-variant">
                    {s.section && (
                      <>
                        <Icon name="group" size={10} />
                        {s.section}
                        <span className="text-on-surface-variant/40">·</span>
                      </>
                    )}
                    <Icon name="meeting_room" size={10} />
                    {s.room ? `Rm ${s.room.roomNumber}` : 'No room'}
                  </p>
                </div>
              </button>
            );
          })}
          {todaySchedules.length > 4 && (
            <button
              onClick={onOpenTimetable}
              className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:bg-surface-container-low"
            >
              View all {todaySchedules.length} in timetable
              <Icon name="arrow_forward" size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
