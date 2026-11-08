import Icon from '../../../components/ui/Icon';
import StatusPill from './StatusPill';
import type { RawSchedule } from '../../../api/schedule.api';
import {
  DAY_ABBR_TO_LABEL,
  fmtTime,
  scheduleDay,
  scheduleStart,
  scheduleEnd,
} from '../utils/dashboard.utils';

export default function ScheduleRow({ s }: { s: RawSchedule }) {
  const day = scheduleDay(s);
  const start = scheduleStart(s);
  const end = scheduleEnd(s);
  return (
    <div className="flex items-start gap-3.5 py-3.5 border-b border-slate-100 last:border-b-0 group hover:bg-slate-50/50 px-2 rounded-lg transition-colors">
      <div className="w-16 shrink-0 text-center">
        <div className="text-[11px] font-mono font-bold text-[#5c1219] bg-[#5c1219]/5 rounded-md py-1 px-1.5">
          {DAY_ABBR_TO_LABEL[day] ?? day}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">
            {s.subject?.subjectCode ?? '—'}
          </span>
          {s.section && (
            <span className="text-xs text-slate-400 font-medium">· {s.section}</span>
          )}
          <StatusPill status={s.status} />
        </div>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Icon name="schedule" size={11} className="text-slate-400" />
            {start && end ? `${fmtTime(start)} – ${fmtTime(end)}` : 'No time set'}
          </span>
          {s.faculty && (
            <span className="inline-flex items-center gap-1">
              <Icon name="person" size={11} className="text-slate-400" />
              {s.faculty.firstName} {s.faculty.lastName}
            </span>
          )}
          {s.room && (
            <span className="inline-flex items-center gap-1">
              <Icon name="meeting_room" size={11} className="text-slate-400" />
              Rm {s.room.roomNumber}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}