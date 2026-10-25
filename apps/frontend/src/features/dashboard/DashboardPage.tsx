import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import {
  fetchSchedules,
  fetchActiveTerm,
  fetchFlagged,
  type RawSchedule,
} from '../../api/schedule.api';
import {
  fetchFacultyRequests,
  type FacultyRequest,
} from '../../api/faculty-requests.api';
import { fetchDepartments } from '../../api/departments.api';
import { fetchUserDirectory } from '../../api/users.api';
import { timeToMinutes } from '../timetable/utils/time.util';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const DAY_ABBR_TO_LABEL: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

function scheduleDay(s: RawSchedule): string {
  return s.dayOfWeek ?? s.timeSlot?.dayOfWeek ?? '';
}

function scheduleStart(s: RawSchedule): string {
  return (s.startTime ?? s.timeSlot?.startTime ?? '').slice(0, 5);
}

function scheduleEnd(s: RawSchedule): string {
  return (s.endTime ?? s.timeSlot?.endTime ?? '').slice(0, 5);
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

function relativeDay(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const then = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor(
    (startOfDay(now) - startOfDay(then)) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Older';
}

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const DAY_ORDER: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
};

const DAY_FULL_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// ─────────────────────────────────────────────
// Quick Action Button (enhanced)
// ─────────────────────────────────────────────

function QuickAction({
  icon,
  label,
  onClick,
  badge,
  accent = 'brand',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  badge?: string | number;
  accent?: 'brand' | 'blue' | 'amber' | 'rose' | 'emerald';
}) {
  const accentMap: Record<
    typeof accent,
    { bg: string; text: string; hover: string; ring: string }
  > = {
    brand: {
      bg: 'bg-[#5c1219]/5',
      text: 'text-[#5c1219]',
      hover: 'hover:bg-[#5c1219]/10',
      ring: 'focus-visible:ring-[#5c1219]/30',
    },
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      hover: 'hover:bg-blue-100',
      ring: 'focus-visible:ring-blue-300',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      hover: 'hover:bg-amber-100',
      ring: 'focus-visible:ring-amber-300',
    },
    rose: {
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      hover: 'hover:bg-rose-100',
      ring: 'focus-visible:ring-rose-300',
    },
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      hover: 'hover:bg-emerald-100',
      ring: 'focus-visible:ring-emerald-300',
    },
  };

  const a = accentMap[accent];

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`relative ${a.bg} ${a.hover} border border-slate-200/80 p-4 flex flex-col items-center justify-center gap-2.5 transition-all duration-200 group focus:outline-none focus-visible:ring-2 ${a.ring} rounded-xl`}
    >
      <span
        className={`w-10 h-10 rounded-lg ${a.bg} ${a.text} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="text-[11px] font-semibold text-slate-700 text-center leading-tight">
        {label}
      </span>
      {badge !== undefined && badge !== 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-[#5c1219] text-white text-[10px] font-bold flex items-center justify-center shadow-sm animate-pulse">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Summary Card (enhanced)
// ─────────────────────────────────────────────

function SummaryCard({
  icon,
  badge,
  badgeVariant = 'neutral',
  label,
  value,
  footer,
  onClick,
  clickable,
  isLoading,
  accent = 'brand',
  hint,
}: {
  icon: string;
  badge?: string;
  badgeVariant?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'rose';
  label: string;
  value: string;
  footer?: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
  isLoading?: boolean;
  accent?: 'brand' | 'blue' | 'amber' | 'rose' | 'emerald';
  hint?: string;
}) {
  const badgeClasses: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    brand: 'bg-red-50 text-red-800 border-red-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const iconAccentMap: Record<
    typeof accent,
    { bg: string; border: string; text: string }
  > = {
    brand: {
      bg: 'bg-[#5c1219]/5',
      border: 'border-[#5c1219]/20',
      text: 'text-[#5c1219]',
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
    },
    rose: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-700',
    },
    emerald: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
    },
  };

  const ia = iconAccentMap[accent];
  const Wrapper = clickable ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      disabled={!clickable}
      title={hint}
      aria-label={hint ?? label}
      className={
        'group bg-white border border-slate-200 p-5 shadow-sm transition-all duration-200 text-left w-full rounded-xl focus:outline-none ' +
        (clickable
          ? 'hover:border-[#5c1219]/30 hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#5c1219]/30'
          : 'hover:border-slate-300')
      }
    >
      <div className="flex justify-between items-start mb-4">
        <div
          className={`w-10 h-10 rounded-lg border ${ia.border} ${ia.bg} flex items-center justify-center ${ia.text} transition-transform duration-200 group-hover:scale-105`}
        >
          {isLoading ? (
            <Icon name="progress_activity" size={18} className="animate-spin" />
          ) : (
            <Icon name={icon} size={20} filled />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-1 rounded-md ${
                badgeClasses[badgeVariant] ?? badgeClasses.neutral
              }`}
            >
              {badge}
            </span>
          )}
          {clickable && (
            <Icon
              name="chevron_right"
              size={16}
              className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all duration-200"
            />
          )}
        </div>
      </div>
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      <div className="text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
        {isLoading ? '—' : value}
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </Wrapper>
  );
}

// ─────────────────────────────────────────────
// Activity Item (enhanced)
// ─────────────────────────────────────────────

function ActivityItem({
  icon,
  iconBg,
  iconColor,
  text,
  time,
  actionLabel,
  onAction,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  text: React.ReactNode;
  time: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-slate-50/80 transition-colors group">
      <div
        className={`w-9 h-9 flex items-center justify-center shrink-0 ${iconBg} ${iconColor} rounded-lg`}
      >
        <Icon name={icon} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 truncate leading-snug">{text}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
          <Icon name="schedule" size={10} />
          {time}
        </p>
      </div>
      <button
        onClick={onAction}
        className="text-[#5c1219] text-xs font-semibold hover:underline shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30 rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
      >
        {actionLabel}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Breakdown list components
// ─────────────────────────────────────────────

function BreakdownEmpty({
  message,
  icon = 'inbox',
  actionLabel,
  onAction,
}: {
  message: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-14 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
        <Icon name={icon} size={28} className="text-slate-300" />
      </div>
      <p className="text-sm text-slate-500 font-medium">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5c1219] hover:underline bg-[#5c1219]/5 px-3 py-1.5 rounded-md hover:bg-[#5c1219]/10 transition-colors"
        >
          {actionLabel}
          <Icon name="arrow_forward" size={12} />
        </button>
      )}
    </div>
  );
}

function ScheduleRow({ s }: { s: RawSchedule }) {
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    review: 'bg-amber-50 text-amber-700 border-amber-200',
    finalized: 'bg-blue-50 text-blue-700 border-blue-200',
    published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={`text-[9px] uppercase tracking-wider font-bold border px-1.5 py-0.5 rounded ${
        map[status] ?? map.draft
      }`}
    >
      {status}
    </span>
  );
}

function RequestRow({
  r,
  deptCode,
  onClick,
}: {
  r: FacultyRequest;
  deptCode: (id: string) => string;
  onClick?: () => void;
}) {
  return (
    <div className="py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 px-2 rounded-lg transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-[#5c1219] bg-[#5c1219]/5 px-1.5 py-0.5 rounded">
              {deptCode(r.requestingDeptId)}
            </span>
            <Icon name="arrow_forward" size={12} className="text-slate-300" />
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              {deptCode(r.targetDeptId)}
            </span>
            <StatusPill status={r.status} />
          </div>
          <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
            {r.reason}
          </p>
          <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Icon name="tag" size={10} />
            Request #{r.requestId} · {relativeTime(r.createdAt)}
          </p>
        </div>
        {onClick && (
          <button
            onClick={onClick}
            className="text-[#5c1219] text-xs font-semibold hover:underline shrink-0 bg-[#5c1219]/5 px-2.5 py-1 rounded-md hover:bg-[#5c1219]/10 transition-colors"
          >
            Review
          </button>
        )}
      </div>
    </div>
  );
}

function FlaggedRow({
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
      <span
        className="w-1 self-stretch rounded-full shrink-0 bg-rose-500"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Icon
            name="flag"
            filled
            size={14}
            className="text-rose-600 shrink-0 self-center"
          />
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
            <Icon
              name="flag"
              filled
              size={12}
              className="text-rose-500 shrink-0 mt-0.5"
            />
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

// ─────────────────────────────────────────────
// Today Widget (enhanced)
// ─────────────────────────────────────────────

function TodayScheduleStrip({
  schedules,
  onOpenTimetable,
}: {
  schedules: RawSchedule[];
  onOpenTimetable: () => void;
}) {
  const now = new Date();
  const todayName = DAY_FULL_NAMES[now.getDay()];
  const todayShort = DAY_ABBR_TO_LABEL[todayName] ?? todayName;

  const todaySchedules = useMemo(
    () =>
      schedules
        .filter((s) => {
          const d = scheduleDay(s);
          return d === todayName || d === todayShort.toUpperCase() || DAY_ABBR_TO_LABEL[d] === todayShort;
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
          <p className="text-sm text-slate-500 font-medium">
            No classes scheduled
          </p>
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

// ─────────────────────────────────────────────
// Term Status Card (enhanced)
// ─────────────────────────────────────────────

function TermStatusCard({
  term,
  scheduleStatusCounts,
  onCreate,
}: {
  term: any | undefined;
  scheduleStatusCounts: { draft: number; review: number; finalized: number; published: number };
  onCreate: () => void;
}) {
  if (!term) {
    return (
      <div className="bg-white border border-dashed border-amber-300 bg-amber-50/40 p-4 rounded-xl flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <Icon name="warning" size={18} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">No active term</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Wait till the Dean creates a new Term...
          </p>
        </div>
      </div>
    );
  }

  const total =
    scheduleStatusCounts.draft +
    scheduleStatusCounts.review +
    scheduleStatusCounts.finalized +
    scheduleStatusCounts.published;

  const dominant: 'draft' | 'review' | 'finalized' | 'published' =
    scheduleStatusCounts.published > 0 &&
    scheduleStatusCounts.draft === 0 &&
    scheduleStatusCounts.review === 0
      ? 'published'
      : scheduleStatusCounts.finalized > 0 &&
        scheduleStatusCounts.draft === 0
      ? 'finalized'
      : scheduleStatusCounts.review > 0
      ? 'review'
      : 'draft';

  const toneMap = {
    draft: { label: 'In progress', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    review: { label: 'Under review', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    finalized: { label: 'Finalized', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    published: { label: 'Published', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  };
  const tone = toneMap[dominant];

  return (
    <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-wrap items-center gap-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#5c1219]/10 to-[#5c1219]/5 flex items-center justify-center">
          <Icon name="calendar_month" size={20} className="text-[#5c1219]" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Active term
          </p>
          <p className="text-sm font-bold text-slate-900">
            {term.termName} · {term.schoolYear}
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md">
          {total} entr{total === 1 ? 'y' : 'ies'}
        </span>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider border px-2.5 py-1 rounded-md ${tone.color}`}
        >
          {tone.label}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

type BreakdownKind = 'schedules' | 'tasks' | 'completion' | 'flagged' | null;

export default function DashboardPage() {
  const { firstName, deptName } = useDepartmentLabel();
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const [breakdown, setBreakdown] = useState<BreakdownKind>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());

  // ── Queries ──
  const { data: activeTerm, isLoading: termLoading } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const { data: schedules = [], isLoading: schedLoading } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const { data: flagged = [], isLoading: flaggedLoading } = useQuery({
    queryKey: ['flagged', activeTerm?.termId],
    queryFn: () => fetchFlagged(activeTerm!.termId),
    enabled: !!activeTerm?.termId,
  });

  const { data: requests = [], isLoading: reqLoading } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
  });

  const { data: directory = [] } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: fetchUserDirectory,
  });

  const { onlineUsers, isConnected } = useOnlineUsers();

  // Track refresh time when queries succeed
  useEffect(() => {
    if (!schedLoading && !reqLoading && !flaggedLoading) {
      setLastRefreshed(Date.now());
    }
  }, [schedLoading, reqLoading, flaggedLoading]);

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['active-term'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['flagged'] });
    qc.invalidateQueries({ queryKey: ['faculty-requests'] });
  }, [qc]);

  const deptCode = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
    `#${id}`;

  // ── Online DHs (excluding self) ──
  const onlineUserIds = new Set(onlineUsers.map((u) => u.user_id));
  const otherDeptHeads = directory.filter(
    (u) =>
      u.role === 'department_head' &&
      u.is_active &&
      u.user_id !== profile?.user_id,
  );
  const onlineOtherDHs = otherDeptHeads.filter((u) =>
    onlineUserIds.has(u.user_id),
  ).length;

  // ── Filter to my dept ──
  const mySchedules = useMemo(
    () =>
      schedules.filter(
        (s) => s.subject?.deptId && String(s.subject.deptId) === myDeptId,
      ),
    [schedules, myDeptId],
  );

  const myRequests = useMemo(
    () =>
      requests.filter((r) => {
        if (!myDeptId) return false;
        return (
          String(r.requestingDeptId) === myDeptId ||
          String(r.targetDeptId) === myDeptId
        );
      }),
    [requests, myDeptId],
  );

  const pendingIncoming = useMemo(
    () =>
      myRequests.filter(
        (r) =>
          r.status === 'pending' && String(r.targetDeptId) === myDeptId,
      ),
    [myRequests, myDeptId],
  );

  // ── Computed metrics ──
  const totalSchedules = mySchedules.length;
  const byStatus = useMemo(
    () => ({
      draft: mySchedules.filter((s) => s.status === 'draft').length,
      review: mySchedules.filter((s) => s.status === 'review').length,
      finalized: mySchedules.filter((s) => s.status === 'finalized').length,
      published: mySchedules.filter((s) => s.status === 'published').length,
    }),
    [mySchedules],
  );
  const finalizedOrPublished = byStatus.finalized + byStatus.published;
  const completionRate =
    totalSchedules > 0
      ? Math.round((finalizedOrPublished / totalSchedules) * 100)
      : 0;

  const flaggedCount = flagged.length;

  const isLoading = schedLoading || reqLoading;
  const isFlaggedLoading = flaggedLoading;

  const recentActivity = useMemo(
    () =>
      [...myRequests]
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        )
        .slice(0, 5),
    [myRequests],
  );

  const groupedActivity = useMemo(() => {
    const groups: Record<string, typeof recentActivity> = {};
    for (const item of recentActivity) {
      const key = relativeDay(item.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [recentActivity]);

  const handleOpenFlaggedEntry = (s: RawSchedule) => {
    setBreakdown(null);
    navigate(`/timetable?focus=${s.scheduleId}`);
  };

  const isLoadingAny = termLoading || isLoading || isFlaggedLoading;
  const refreshedLabel = isLoadingAny
    ? 'Refreshing…'
    : `Updated ${relativeTime(new Date(lastRefreshed).toISOString())}`;

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-6 mt-1 md:mt-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5c1219] to-[#3d0b10] flex items-center justify-center shadow-sm shrink-0">
              <Icon name="dashboard" size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
                {greeting()}, {firstName}
              </h1>
              <p className="text-sm text-slate-500">
                Here is the current status of the <strong className="text-slate-700">{deptName}</strong>{' '}
                department schedule
                {activeTerm
                  ? ` ${activeTerm.termName} ${activeTerm.schoolYear}.`
                  : '.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
            <span
              className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5"
              aria-live="polite"
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  isLoadingAny ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              <Icon name="schedule" size={12} />
              {refreshedLabel}
            </span>
            <button
              onClick={refreshAll}
              disabled={isLoadingAny}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
              title="Refresh dashboard"
              aria-label="Refresh dashboard"
            >
              <Icon
                name="refresh"
                size={14}
                className={isLoadingAny ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Term status bar ── */}
      <TermStatusCard
        term={activeTerm}
        scheduleStatusCounts={byStatus}
        onCreate={() => navigate('/system-config/terms')}
      />

      {/* ── Bento grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6 mt-4">
        {/* Quick Actions */}
        <div className="md:col-span-4 bg-white border border-slate-200 p-5 shadow-sm rounded-xl flex flex-col">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Icon name="bolt" size={14} className="text-amber-500" filled />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2.5 flex-1">
            <QuickAction
              icon="add_circle"
              label="New Schedule"
              accent="brand"
              onClick={() => navigate('/timetable')}
            />
            <QuickAction
              icon="task_alt"
              label="Tasks"
              accent="amber"
              badge={pendingIncoming.length}
              onClick={() => setBreakdown('tasks')}
            />
            <QuickAction
              icon="flag"
              label="Flagged"
              accent="rose"
              badge={flaggedCount}
              onClick={() => setBreakdown('flagged')}
            />
            <QuickAction
              icon="search"
              label="Search Faculty"
              accent="blue"
              onClick={() => navigate('/faculty')}
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            icon="view_timeline"
            accent="blue"
            badge={activeTerm?.termName ?? 'No term'}
            badgeVariant="neutral"
            label="Active Schedules"
            value={String(totalSchedules)}
            isLoading={isLoading}
            clickable={!isLoading && totalSchedules > 0}
            onClick={() => setBreakdown('schedules')}
            hint={
              totalSchedules > 0
                ? `View all ${totalSchedules} schedule entries`
                : undefined
            }
            footer={
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span className="font-semibold text-slate-700">
                    {byStatus.draft}
                  </span>
                  <span>draft</span>
                </span>
                <span className="inline-flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="font-semibold text-amber-700">
                    {byStatus.review}
                  </span>
                  <span>review</span>
                </span>
              </div>
            }
          />

          <SummaryCard
            icon="checklist"
            accent="amber"
            badge={pendingIncoming.length > 0 ? 'Urgent' : 'Clear'}
            badgeVariant={pendingIncoming.length > 0 ? 'danger' : 'success'}
            label="Tasks to do"
            value={String(pendingIncoming.length)}
            isLoading={isLoading}
            clickable={!isLoading && pendingIncoming.length > 0}
            onClick={() => setBreakdown('tasks')}
            hint={
              pendingIncoming.length > 0
                ? `Review ${pendingIncoming.length} pending cross-dept requests`
                : 'No pending tasks'
            }
            footer={
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    pendingIncoming.length > 0
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className="text-xs text-slate-500">
                  {pendingIncoming.length > 0
                    ? `${pendingIncoming.length} request${
                        pendingIncoming.length === 1 ? '' : 's'
                      } pending`
                    : 'No pending requests'}
                </span>
              </div>
            }
          />

          <SummaryCard
            icon="donut_large"
            accent="brand"
            label="Completion Rate"
            value={`${completionRate}%`}
            isLoading={isLoading}
            clickable={!isLoading && totalSchedules > 0}
            onClick={() => setBreakdown('completion')}
            hint={
              totalSchedules > 0
                ? `${finalizedOrPublished} of ${totalSchedules} finalized or published`
                : undefined
            }
            footer={
              <div className="w-full">
                <div className="w-full bg-slate-100 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-gradient-to-r from-[#5c1219] to-[#8b1e2a] h-2 transition-all duration-500 rounded-full"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-right tabular-nums">
                  {finalizedOrPublished}/{totalSchedules} complete
                </p>
              </div>
            }
          />

          <SummaryCard
            icon="flag"
            accent="rose"
            badge={flaggedCount > 0 ? 'Action' : 'Clean'}
            badgeVariant={flaggedCount > 0 ? 'rose' : 'success'}
            label="Flagged for review"
            value={String(flaggedCount)}
            isLoading={isFlaggedLoading}
            clickable={!isFlaggedLoading && flaggedCount > 0}
            onClick={() => setBreakdown('flagged')}
            hint={
              flaggedCount > 0
                ? `${flaggedCount} entr${flaggedCount === 1 ? 'y' : 'ies'} need review`
                : 'Nothing flagged'
            }
            footer={
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    flaggedCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
                <span className="text-xs text-slate-500">
                  {flaggedCount > 0
                    ? `${flaggedCount} entr${
                        flaggedCount === 1 ? 'y' : 'ies'
                      } need review`
                    : 'Nothing flagged'}
                </span>
              </div>
            }
          />
        </div>
      </div>

      {/* ── Today + Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today */}
        <div className="lg:col-span-1">
          <TodayScheduleStrip
            schedules={mySchedules}
            onOpenTimetable={() => navigate('/timetable')}
          />
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Icon name="history" size={14} className="text-slate-400" />
              Recent Scheduling Activity
            </h3>
            {recentActivity.length > 0 && (
              <Link
                to="/approvals"
                className="text-xs font-semibold text-[#5c1219] hover:underline flex items-center gap-1"
              >
                View all
                <Icon name="arrow_forward" size={12} />
              </Link>
            )}
          </div>
          <div>
            {isLoading ? (
              <div className="py-14 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                <Icon
                  name="progress_activity"
                  size={16}
                  className="animate-spin"
                />
                Loading activity…
              </div>
            ) : recentActivity.length === 0 ? (
              <BreakdownEmpty
                icon="inbox"
                message="No recent activity in your department."
                actionLabel="Open Approvals"
                onAction={() => navigate('/approvals')}
              />
            ) : (
              Object.entries(groupedActivity).map(([group, items]) => (
                <div key={group}>
                  <div className="px-5 py-2 bg-slate-50/80 border-y border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((r) => {
                      const isIncoming =
                        String(r.targetDeptId) === myDeptId &&
                        r.status === 'pending';
                      const isApproved = r.status === 'approved';
                      const isRejected = r.status === 'rejected';
                      const iconName = isApproved
                        ? 'check_circle'
                        : isRejected
                        ? 'cancel'
                        : 'pending_actions';
                      const iconBg = isApproved
                        ? 'bg-emerald-50'
                        : isRejected
                        ? 'bg-red-50'
                        : 'bg-amber-50';
                      const iconColor = isApproved
                        ? 'text-emerald-700'
                        : isRejected
                        ? 'text-red-700'
                        : 'text-amber-700';

                      return (
                        <ActivityItem
                          key={r.requestId}
                          icon={iconName}
                          iconBg={iconBg}
                          iconColor={iconColor}
                          text={
                            <>
                              <span className="font-mono font-bold">
                                {deptCode(r.requestingDeptId)}
                              </span>
                              {' → '}
                              <span className="font-mono font-bold">
                                {deptCode(r.targetDeptId)}
                              </span>
                              {' · '}
                              <span className="text-slate-600">{r.reason}</span>
                            </>
                          }
                          time={relativeTime(r.createdAt)}
                          actionLabel={isIncoming ? 'Review' : 'View'}
                          onAction={() => navigate('/approvals')}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Other Department Heads Online ── */}
      <div className="mt-6 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
              }`}
              aria-hidden
            />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Other Department Heads
            </h3>
          </div>
          <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
            {onlineOtherDHs} of {otherDeptHeads.length} online
          </span>
        </div>

        {otherDeptHeads.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400">
            No other department heads configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {otherDeptHeads.map((head) => {
              const isOnline = onlineUserIds.has(head.user_id);
              const dept = departments.find(
                (d) => String(d.deptId) === String(head.dept_id),
              );
              return (
                <div
                  key={head.user_id}
                  className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 text-xs font-bold flex items-center justify-center">
                      {initials(head.username)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white rounded-full ${
                        isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {head.username}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {dept
                        ? `[${dept.deptCode}] ${dept.deptName}`
                        : 'No department'}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider border px-2 py-1 shrink-0 rounded-md ${
                      isOnline
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Breakdown Modals ── */}

      <Modal
        open={breakdown === 'schedules'}
        onClose={() => setBreakdown(null)}
        title="Active Schedules"
        description={`${totalSchedules} ${
          totalSchedules === 1 ? 'entry' : 'entries'
        } in ${deptName}${activeTerm ? ` · ${activeTerm.termName}` : ''}`}
        size="lg"
      >
        {totalSchedules === 0 ? (
          <BreakdownEmpty
            icon="event_note"
            message="No schedule entries yet. Start by plotting a subject."
            actionLabel="Open Timetable"
            onAction={() => {
              setBreakdown(null);
              navigate('/timetable');
            }}
          />
        ) : (
          <div>
            {[...mySchedules]
              .sort((a, b) => {
                const da = DAY_ORDER[scheduleDay(a)] ?? 99;
                const db = DAY_ORDER[scheduleDay(b)] ?? 99;
                if (da !== db) return da - db;
                return (
                  timeToMinutes(scheduleStart(a) || '00:00') -
                  timeToMinutes(scheduleStart(b) || '00:00')
                );
              })
              .map((s) => (
                <ScheduleRow key={s.scheduleId} s={s} />
              ))}
          </div>
        )}
      </Modal>

      <Modal
        open={breakdown === 'tasks'}
        onClose={() => setBreakdown(null)}
        title="Pending Tasks"
        description={`${pendingIncoming.length} cross-department request${
          pendingIncoming.length === 1 ? '' : 's'
        } awaiting your decision`}
        size="lg"
      >
        {pendingIncoming.length === 0 ? (
          <BreakdownEmpty
            icon="check_circle"
            message="Nothing pending. You're all caught up."
          />
        ) : (
          <div>
            {pendingIncoming.map((r) => (
              <RequestRow
                key={r.requestId}
                r={r}
                deptCode={deptCode}
                onClick={() => {
                  setBreakdown(null);
                  navigate('/approvals');
                }}
              />
            ))}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <Link
                to="/approvals"
                className="text-xs font-semibold text-[#5c1219] hover:underline flex items-center gap-1"
              >
                Go to Approvals
                <Icon name="arrow_forward" size={14} />
              </Link>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={breakdown === 'completion'}
        onClose={() => setBreakdown(null)}
        title="Completion Rate"
        description={`${finalizedOrPublished} of ${totalSchedules} entries finalized or published`}
        size="md"
      >
        {totalSchedules === 0 ? (
          <BreakdownEmpty message="No schedule entries to summarize." />
        ) : (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-5xl font-extrabold text-[#5c1219] tabular-nums">
                {completionRate}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {finalizedOrPublished} of {totalSchedules} complete
              </p>
            </div>

            <div className="w-full bg-slate-100 h-2.5 overflow-hidden rounded-full">
              <div
                className="bg-gradient-to-r from-[#5c1219] to-[#8b1e2a] h-2.5 transition-all duration-500 rounded-full"
                style={{ width: `${completionRate}%` }}
              />
            </div>

            <div className="pt-2 space-y-2.5">
              <StatusRow
                label="Draft"
                count={byStatus.draft}
                total={totalSchedules}
                barColor="bg-slate-400"
              />
              <StatusRow
                label="In Review"
                count={byStatus.review}
                total={totalSchedules}
                barColor="bg-amber-500"
              />
              <StatusRow
                label="Finalized"
                count={byStatus.finalized}
                total={totalSchedules}
                barColor="bg-blue-500"
              />
              <StatusRow
                label="Published"
                count={byStatus.published}
                total={totalSchedules}
                barColor="bg-emerald-500"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={breakdown === 'flagged'}
        onClose={() => setBreakdown(null)}
        title="Flagged for review"
        description={`${flaggedCount} ${
          flaggedCount === 1 ? 'entry' : 'entries'
        } flagged${activeTerm ? ` · ${activeTerm.termName}` : ''}`}
        size="lg"
      >
        {flaggedCount === 0 ? (
          <BreakdownEmpty icon="verified" message="Nothing flagged. Looking good." />
        ) : (
          <div>
            {flagged.map((s) => (
              <FlaggedRow
                key={s.scheduleId}
                s={s}
                onOpen={() => handleOpenFlaggedEntry(s)}
              />
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────
// Completion breakdown row
// ─────────────────────────────────────────────

function StatusRow({
  label,
  count,
  total,
  barColor,
}: {
  label: string;
  count: number;
  total: number;
  barColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500">
          <span className="font-bold text-slate-900 tabular-nums">{count}</span>
          {' · '}
          <span className="tabular-nums">{pct}%</span>
        </span>
      </div>
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div
          className={`${barColor} h-2 transition-all duration-300 rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}