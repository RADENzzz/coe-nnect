import Icon from '../../../components/ui/Icon';
import type { RawSchedule } from '../../../api/schedule.api';
import {
  DAY_ABBR_TO_LABEL,
  fmtTime,
  relativeTime,
  scheduleDay,
  scheduleStart,
  scheduleEnd,
} from '../utils/dashboard.utils';

export default function FlaggedRow({
  s,
  onOpen,
}: {
  s: RawSchedule;
  onOpen: () => void;
}) {
  const day = scheduleDay(s);
  const start = scheduleStart(s);
  const end = scheduleEnd(s);
  return (
    <button
      onClick={onOpen}
      className="w-full text-left py-3.5 border-b border-slate-100 last:border-b-0 px-2 hover:bg-rose-50/60 transition-colors flex items-start gap-3 focus:outline-none focus-visible:bg-rose-50/60 rounded-lg"
    >
      <span className="w-1 self-stretch rounded-full shrink-0 bg-rose-500" aria-hidden />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Icon name="flag" filled size={14} className="text-rose-600 shrink-0 self-center" />
          <span className="font-semibold text-slate-900 text-sm">
            {s.subject?.subjectCode ?? '—'}
          </span>
          {s.section && (
            <span className="text-xs text-slate-400 font-medium">· {s.section}</span>
          )}
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-bold">
            {s.loadType ?? 'lecture'}
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-0.5 truncate">
          {s.subject?.title ?? '—'}
        </p>
        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Icon name="schedule" size={10} className="text-slate-400" />
            {DAY_ABBR_TO_LABEL[day] ?? day}
            {start && end ? ` · ${fmtTime(start)} – ${fmtTime(end)}` : ''}
          </span>
          {s.faculty && (
            <span className="inline-flex items-center gap-1">
              <Icon name="person" size={10} className="text-slate-400" />
              {s.faculty.firstName} {s.faculty.lastName}
            </span>
          )}
          {s.room && (
            <span className="inline-flex items-center gap-1">
              <Icon name="meeting_room" size={10} className="text-slate-400" />
              Rm {s.room.roomNumber}
            </span>
          )}
        </p>
        {s.flagReason && (
          <div className="mt-2 flex items-start gap-1.5 px-2.5 py-2 rounded-md bg-white border border-rose-200/80">
            <Icon name="flag" filled size={12} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-rose-900 leading-snug break-words">
              {s.flagReason}
            </p>
          </div>
        )}
        {s.flaggedAt && (
          <p className="text-[10px] text-rose-600 mt-1.5 flex items-center gap-1">
            <Icon name="schedule" size={10} />
            Flagged {relativeTime(s.flaggedAt)}
          </p>
        )}
      </div>
      <Icon
        name="chevron_right"
        size={18}
        className="text-slate-300 shrink-0 mt-1 group-hover:text-slate-500 transition-colors"
      />
    </button>
  );
}