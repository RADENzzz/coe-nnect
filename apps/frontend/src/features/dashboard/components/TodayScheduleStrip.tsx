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

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[#5c1219]/10 flex items-center justify-center">
            <Icon name="today" size={16} className="text-[#5c1219]" />
          </span>
          <div>
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Today
            </h3>
            <p className="text-xs font-semibold text-slate-700">{todayName}</p>
          </div>
        </div>
        <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
          {todaySchedules.length} class{todaySchedules.length === 1 ? '' : 'es'}
        </span>
      </div>

      {todaySchedules.length === 0 ? (
        <div className="py-10 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
            <Icon name="event_available" size={24} className="text-emerald-500" />
          </div>
          <p className="text-sm text-slate-500 font-medium">No classes scheduled</p>
          <p className="text-xs text-slate-400 mt-0.5">Enjoy your free day!</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {todaySchedules.slice(0, 4).map((s) => {
            const start = scheduleStart(s);
            const end = scheduleEnd(s);
            const isUpNext = upNext?.scheduleId === s.scheduleId;
            const isPast = timeToMinutes(end || '23:59') < nowMin;
            return (
              <button
                key={s.scheduleId}
                onClick={onOpenTimetable}
                className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-colors focus:outline-none focus-visible:bg-slate-50 ${
                  isPast
                    ? 'opacity-50'
                    : isUpNext
                    ? 'bg-[#5c1219]/5 hover:bg-[#5c1219]/10'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-16 shrink-0">
                  <div className="text-xs font-mono font-bold text-slate-900">
                    {fmtTime(start)}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {fmtTime(end)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {s.subject?.subjectCode ?? '—'}
                    </span>
                    {isUpNext && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#5c1219] text-white shrink-0">
                        Up next
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
                    {s.section && (
                      <>
                        <Icon name="group" size={10} className="text-slate-400" />
                        {s.section}
                        <span className="text-slate-300">·</span>
                      </>
                    )}
                    <Icon name="meeting_room" size={10} className="text-slate-400" />
                    {s.room ? `Rm ${s.room.roomNumber}` : 'No room'}
                  </p>
                </div>
              </button>
            );
          })}
          {todaySchedules.length > 4 && (
            <button
              onClick={onOpenTimetable}
              className="w-full px-5 py-2.5 text-xs font-semibold text-[#5c1219] hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
            >
              View all {todaySchedules.length} in Timetable
              <Icon name="arrow_forward" size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}