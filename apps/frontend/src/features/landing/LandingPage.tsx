import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import Icon from '../../components/ui/Icon';
import ThemeToggle from '../../components/ui/ThemeToggle';
import ThemeStyleMenu from '../../components/ui/ThemeStyleMenu';
import RollingValue from '../../components/ui/RollingValue';
import CetLogo from '../../components/brand/CetLogo';
import WmsuSeal from '../../components/brand/WmsuSeal';
import WmsuIntro from './components/WmsuIntro';
import { useAuthStore } from '../../store/auth.store';
import { useAppearanceStore } from '../../store/appearance.store';
import {
  fetchPublicFaculty,
  fetchPublicIntegration,
  fetchPublicSchedules,
  type IntegrationMilestoneStatus,
  type IntegrationState,
  type PublicFaculty,
  type PublicFacultyAccountRole,
  type PublicFacultyMember,
  type PublicIntegrationStatus,
  type PublicSchedules,
} from '../../api/public.api';
import {
  scheduleFaculty,
  scheduleRoom,
  scheduleRoomKey,
  WEEK_DAYS,
} from './schedule-utils';

// The planner is the heaviest interactive surface on this page (drag and drop,
// week grid, export pipeline). Load it only when the student opens that tab so
// the public schedule view stays light.
const StudentPlannerPanelLazy = lazy(() => import('./StudentPlannerPanel'));

// The 3D viewer pulls in three.js. Keep it out of the initial bundle so the
// public landing page still paints quickly on first visit.
const CoeBuildingViewerLazy = lazy(() => import('./CoeBuildingViewer'));

type LandingTab = 'schedules' | 'planner' | 'faculty' | 'integration';

/**
 * The IDP app promo is deployment-configurable. Only http(s) links are
 * rendered so a malformed value can never inject a `javascript:` URL.
 */
function readExternalUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const IDP_APP_URL = readExternalUrl(import.meta.env.VITE_IDP_APP_URL);
const IDP_APP_NAME =
  import.meta.env.VITE_IDP_APP_NAME?.trim() ||
  'Institutional Data Platform (IDP)';

const DAY_TONE: Record<string, string> = {
  Monday:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-[#f43f5e]/10 dark:text-[#fda4af] dark:border-[#f43f5e]/30',
  Tuesday:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-[#f59e0b]/10 dark:text-[#fcd34d] dark:border-[#f59e0b]/30',
  Wednesday:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-[#10b981]/10 dark:text-[#6ee7b7] dark:border-[#10b981]/30',
  Thursday:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-[#0ea5e9]/10 dark:text-[#7dd3fc] dark:border-[#0ea5e9]/30',
  Friday:
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-[#8b5cf6]/10 dark:text-[#c4b5fd] dark:border-[#8b5cf6]/30',
  Saturday:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-[#64748b]/15 dark:text-[#cbd5e1] dark:border-[#64748b]/30',
  Sunday:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-[#64748b]/15 dark:text-[#cbd5e1] dark:border-[#64748b]/30',
};

function StatCard({
  icon,
  label,
  value,
  hint,
  loading = false,
}: {
  icon: string;
  label: string;
  value: number | string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2 text-on-surface-variant">
        <Icon name={icon} size={16} />
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-on-surface tabular-nums">
        <RollingValue value={value} loading={loading} />
      </p>
      {hint && (
        <p className="mt-1 text-xs text-on-surface-variant">
          <RollingValue
            value={hint}
            loading={loading}
            loadingLength={Math.min(22, hint.length)}
          />
        </p>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  to,
  featured = false,
  className = '',
}: {
  icon: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction?: () => void;
  to?: string;
  featured?: boolean;
  className?: string;
}) {
  const actionClasses =
    'mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80';

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md ${
        featured
          ? 'border-primary/20 bg-gradient-to-br from-primary/[0.07] via-surface to-surface'
          : 'border-outline-variant bg-surface'
      } ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" />
      <span
        className={`flex items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105 ${
          featured ? 'h-12 w-12' : 'h-10 w-10'
        }`}
      >
        <Icon name={icon} size={featured ? 22 : 19} />
      </span>
      <h3
        className={`mt-4 font-semibold text-on-surface ${
          featured ? 'text-xl' : 'text-base'
        }`}
      >
        {title}
      </h3>
      <p
        className={`mt-1.5 text-sm leading-relaxed text-on-surface-variant ${
          featured ? 'max-w-md' : ''
        }`}
      >
        {body}
      </p>
      <div className="mt-auto">
        {to ? (
          <Link to={to} className={actionClasses}>
            {actionLabel}
            <Icon name="arrow_forward" size={14} />
          </Link>
        ) : (
          <button type="button" onClick={onAction} className={actionClasses}>
            {actionLabel}
            <Icon name="arrow_forward" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Faculty-facing advertisement for the IDP desktop/web application.
 *
 * The IDP team owns that app, so the link is supplied by the deployment
 * (`VITE_IDP_APP_URL`) rather than hard-coded. When it is not set the promo is
 * not rendered at all.
 */
function IdpAppPromo() {
  if (!IDP_APP_URL) return null;

  return (
    <section aria-labelledby="idp-app-promo-title" className="mb-12">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-surface p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
              <Icon name="apps" size={22} />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                Faculty resource
              </p>
              <h2
                id="idp-app-promo-title"
                className="mt-1 text-xl font-semibold text-on-surface"
              >
                {IDP_APP_NAME}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
                Manage your faculty profile, qualifications, and availability in
                the university's Institutional Data Platform. The app is provided
                by the IDP team and opens in a new tab.
              </p>
            </div>
          </div>
          <a
            href={IDP_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:opacity-90"
          >
            Open IDP app
            <Icon name="open_in_new" size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

function TabButton({
  id,
  active,
  icon,
  children,
  onClick,
}: {
  id: string;
  active: boolean;
  icon: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls="public-panel"
      onClick={onClick}
      className={`inline-flex shrink-0 snap-start items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-on-surface-variant hover:text-on-surface'
      }`}
    >
      <Icon name={icon} size={17} />
      {children}
    </button>
  );
}

function PanelState({
  loading,
  error,
  empty,
  onRetry,
  onClear,
  emptyTitle = 'No matching records.',
  emptyHint = 'Try clearing the search or choosing a different filter.',
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
  onClear?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-on-surface-variant">
        <Icon name="progress_activity" size={18} spin />
        Loading public data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Icon name="warning" size={26} className="text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-on-surface">
            Public data is temporarily unavailable.
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Please try again in a moment.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Icon name="search_off" size={26} className="text-on-surface-variant" />
        <p className="text-sm font-semibold text-on-surface">{emptyTitle}</p>
        <p className="max-w-sm text-xs text-on-surface-variant">
          {emptyHint}
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="mt-1 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return null;
}

const ACCOUNT_ROLE_META: Record<
  PublicFacultyAccountRole,
  { label: string; icon: string; tone: string }
> = {
  college_dean: {
    label: 'College Dean',
    icon: 'workspace_premium',
    tone: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10',
  },
  department_head: {
    label: 'Department Head',
    icon: 'supervisor_account',
    tone: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10',
  },
  college_secretary: {
    label: 'College Secretary',
    icon: 'edit_note',
    tone: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10',
  },
};

function scheduleCardTone(loadType: string | null): string {
  if (loadType === 'laboratory') {
    return 'border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10';
  }
  if (loadType === 'lecture') {
    return 'border-primary/25 bg-primary/5 text-on-surface';
  }
  return 'border-outline-variant bg-surface-container-low text-on-surface';
}

function SchedulesPanel({
  data,
  isLoading,
  isError,
  onRetry,
  selectedTermId,
  onTermChange,
}: {
  data: PublicSchedules | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedTermId: string;
  onTermChange: (termId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const departments = useMemo(() => {
    const codes = new Set<string>();
    for (const entry of entries) {
      if (entry.departmentCode) codes.add(entry.departmentCode);
    }
    return Array.from(codes).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  // A term change can remove the selected department; clear it rather than
  // leaving the panel stuck on a department that has no published rows.
  useEffect(() => {
    if (department && !departments.includes(department)) {
      setDepartment('');
    }
  }, [department, departments]);

  // Faculty and room options are department-scoped, so they reset whenever
  // the department changes.
  useEffect(() => {
    setFacultyFilter('');
    setRoomFilter('');
  }, [department]);

  const departmentEntries = useMemo(
    () => entries.filter((entry) => entry.departmentCode === department),
    [department, entries],
  );

  const facultyOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const entry of departmentEntries) {
      if (entry.facultyName) {
        options.set(entry.facultyName, entry.facultyName);
      } else if (entry.externalFacultyName) {
        options.set(
          entry.externalFacultyName,
          `${entry.externalFacultyName} (external)`,
        );
      }
    }
    return Array.from(options, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label),
    );
  }, [departmentEntries]);

  const roomOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const entry of departmentEntries) {
      const room = scheduleRoom(entry);
      if (room === '—') continue;
      const label = [room, entry.building].filter(Boolean).join(' · ');
      options.set(scheduleRoomKey(entry), label);
    }
    return Array.from(options, ([value, label]) => ({ value, label })).sort(
      (a, b) => a.label.localeCompare(b.label),
    );
  }, [departmentEntries]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return departmentEntries.filter((entry) => {
      if (facultyFilter && scheduleFaculty(entry) !== facultyFilter) {
        return false;
      }
      if (roomFilter && scheduleRoomKey(entry) !== roomFilter) return false;
      if (!needle) return true;
      return [
        entry.subjectCode,
        entry.subjectTitle,
        entry.sectionCode,
        entry.facultyName,
        entry.externalFacultyName,
        entry.roomNumber,
        entry.externalRoomName,
        entry.building,
        entry.dayOfWeek,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [departmentEntries, facultyFilter, roomFilter, search]);

  const dayColumns = useMemo(() => {
    const present = new Set(departmentEntries.map((entry) => entry.dayOfWeek));
    const days: string[] = WEEK_DAYS.filter((day) => present.has(day));
    if (present.has('Sunday')) days.push('Sunday');
    return days.length > 0 ? days : WEEK_DAYS.slice(0, 5);
  }, [departmentEntries]);

  const startTimes = useMemo(
    () =>
      Array.from(new Set(filtered.map((entry) => entry.startTime))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [filtered],
  );

  // Bucket the filtered rows once per day/time slot instead of scanning the
  // whole list for every grid cell.
  const slotEntries = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const entry of filtered) {
      const key = `${entry.dayOfWeek}|${entry.startTime}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  }, [filtered]);

  const hasActiveFilters = Boolean(
    search.trim() || facultyFilter || roomFilter,
  );
  const termLabel = data?.term
    ? (data.term.termCode ?? data.term.termName)
    : null;
  const roomFilterLabel =
    roomOptions.find((option) => option.value === roomFilter)?.label ?? '';

  const clearFilters = () => {
    setSearch('');
    setFacultyFilter('');
    setRoomFilter('');
  };

  return (
    <div>
      <div className="no-print mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Academic term
            </span>
            <select
              value={selectedTermId}
              onChange={(event) => onTermChange(event.target.value)}
              disabled={!data?.terms.length}
              className="h-10 min-w-48 rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            >
              {(data?.terms ?? []).map((term) => (
                <option key={term.termId} value={term.termId}>
                  {term.termCode ?? term.termName} ({term.publishedCount})
                </option>
              ))}
              {!data?.terms.length && <option value="">No published terms</option>}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Department
            </span>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              disabled={!departments.length}
              className="h-10 min-w-44 rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            >
              <option value="">
                {departments.length
                  ? 'Select a department…'
                  : 'No published departments'}
              </option>
              {departments.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Faculty
            </span>
            <select
              value={facultyFilter}
              onChange={(event) => setFacultyFilter(event.target.value)}
              disabled={!department || facultyOptions.length === 0}
              className="h-10 min-w-48 rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            >
              <option value="">All faculty</option>
              {facultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Room
            </span>
            <select
              value={roomFilter}
              onChange={(event) => setRoomFilter(event.target.value)}
              disabled={!department || roomOptions.length === 0}
              className="h-10 min-w-40 rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            >
              <option value="">All rooms</option>
              {roomOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search published schedules</span>
            <Icon
              name="search"
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!department}
              placeholder="Search subject, section, faculty, room…"
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-9 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!department || filtered.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 text-sm font-semibold text-on-surface transition hover:bg-surface-container disabled:opacity-50"
          >
            <Icon name="print" size={16} />
            Print
          </button>
        </div>
      </div>

      {isLoading || isError ? (
        <PanelState
          loading={isLoading}
          error={isError}
          empty={false}
          onRetry={onRetry}
        />
      ) : entries.length === 0 ? (
        <PanelState
          loading={false}
          error={false}
          empty
          onRetry={onRetry}
          emptyTitle="No published schedules yet."
          emptyHint="Published class blocks will appear here once the college publishes them."
        />
      ) : !department ? (
        <div className="no-print mt-5 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-outline-variant bg-surface-container-low/50 px-6 py-8 text-center">
          <Icon
            name="account_balance"
            size={26}
            className="text-on-surface-variant"
          />
          <p className="text-sm font-semibold text-on-surface">
            Choose a department to view its schedule
          </p>
          <p className="max-w-md text-xs leading-relaxed text-on-surface-variant">
            Schedules are published one department at a time. Pick a department
            above, then narrow the weekly grid by faculty or room. The faculty
            and room filters only list people and spaces used by that
            department.
          </p>
        </div>
      ) : (
        <>
          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
            <p aria-live="polite">
              Showing{' '}
              <strong className="text-on-surface">{filtered.length}</strong> of{' '}
              {departmentEntries.length} published class blocks for{' '}
              <strong className="text-on-surface">{department}</strong>
              {termLabel ? ` · ${termLabel}` : ''}.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs font-semibold text-on-surface transition hover:bg-surface-container"
              >
                Clear filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <PanelState
              loading={false}
              error={false}
              empty
              onRetry={onRetry}
              onClear={hasActiveFilters ? clearFilters : undefined}
              emptyTitle="No class blocks match these filters."
              emptyHint="Try another faculty member, room, or search term."
            />
          ) : (
            <div className="landing-schedule-print mt-4 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
              <div className="hidden border-b border-outline-variant px-4 py-3 print:block">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  CoE-NNECT · College of Engineering
                </p>
                <h3 className="mt-0.5 text-base font-bold text-on-surface">
                  {department} published schedule
                </h3>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  {termLabel ?? 'Published term'}
                  {facultyFilter ? ` · ${facultyFilter}` : ''}
                  {roomFilterLabel ? ` · ${roomFilterLabel}` : ''}
                  {' · printed '}
                  {new Date().toLocaleDateString()}
                </p>
              </div>

              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-container-low">
                      <th className="w-20 border-b border-r border-outline-variant px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                        Time
                      </th>
                      {dayColumns.map((day) => (
                        <th
                          key={day}
                          className="border-b border-outline-variant px-3 py-2 text-left"
                        >
                          <span
                            data-day={day}
                            className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                              DAY_TONE[day] ??
                              'border-outline-variant bg-surface-container text-on-surface-variant'
                            }`}
                          >
                            {day}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {startTimes.map((time) => (
                      <tr key={time} className="align-top">
                        <th
                          scope="row"
                          className="w-20 border-b border-r border-outline-variant bg-surface-container-low/60 px-3 py-2 text-left align-top font-mono text-[11px] font-semibold text-on-surface-variant"
                        >
                          {time}
                        </th>
                        {dayColumns.map((day) => {
                          const cellEntries =
                            slotEntries.get(`${day}|${time}`) ?? [];
                          return (
                            <td
                              key={day}
                              className="border-b border-outline-variant p-1.5 align-top"
                            >
                              {cellEntries.length === 0 ? (
                                <span className="block px-1 py-2 text-[11px] text-on-surface-variant/30">
                                  —
                                </span>
                              ) : (
                                <div className="space-y-1.5">
                                  {cellEntries.map((entry) => (
                                    <article
                                      key={entry.scheduleId}
                                      data-load-type={
                                        entry.loadType ?? 'other'
                                      }
                                      className={`schedule-print-card rounded-lg border p-2 text-[11px] leading-snug ${scheduleCardTone(
                                        entry.loadType,
                                      )}`}
                                      title={`${entry.subjectCode ?? ''} ${
                                        entry.subjectTitle ?? ''
                                      }`}
                                    >
                                      <p className="font-bold">
                                        {entry.subjectCode ?? '—'}
                                        {entry.sectionCode
                                          ? ` · ${entry.sectionCode}`
                                          : ''}
                                      </p>
                                      <p className="mt-0.5 line-clamp-2 text-[10px] opacity-80">
                                        {entry.subjectTitle ?? 'Untitled subject'}
                                      </p>
                                      <p className="mt-1 font-mono text-[10px] font-semibold">
                                        {entry.startTime}–{entry.endTime}
                                      </p>
                                      <p className="mt-0.5 truncate text-[10px]">
                                        {scheduleRoom(entry)}
                                        {entry.building
                                          ? ` · ${entry.building}`
                                          : ''}
                                      </p>
                                      <p className="truncate text-[10px] opacity-80">
                                        {scheduleFaculty(entry)}
                                      </p>
                                    </article>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: PublicFacultyAccountRole | null }) {
  if (!role) return null;
  const meta = ACCOUNT_ROLE_META[role];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}
    >
      <Icon name={meta.icon} size={11} />
      {meta.label}
    </span>
  );
}

function FacultyNode({ member }: { member: PublicFacultyMember }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-on-surface">
          {member.fullName}
        </p>
        <RoleBadge role={member.accountRole} />
        {member.idpLinked && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <Icon name="link" size={11} />
            IDP
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-on-surface-variant">
        {member.designation ?? 'Faculty'}
      </p>
    </div>
  );
}

function FacultyPanel({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: PublicFaculty | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [view, setView] = useState<'tree' | 'type' | null>(null);

  const faculty = useMemo(() => data?.faculty ?? [], [data?.faculty]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return faculty.filter((member) => {
      if (department && member.departmentCode !== department) return false;
      if (!needle) return true;
      return [
        member.fullName,
        member.departmentCode,
        member.departmentName,
        member.designation,
        member.accountRole
          ? ACCOUNT_ROLE_META[member.accountRole].label
          : '',
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [department, faculty, search]);

  const hasLeadership = useMemo(
    () => faculty.some((member) => member.accountRole !== null),
    [faculty],
  );
  // Default to the hierarchy when leadership accounts exist, otherwise show
  // the designation-grouped list.
  const effectiveView = view ?? (hasLeadership ? 'tree' : 'type');

  const deans = useMemo(
    () =>
      filtered.filter((member) => member.accountRole === 'college_dean'),
    [filtered],
  );
  const secretaries = useMemo(
    () =>
      filtered.filter((member) => member.accountRole === 'college_secretary'),
    [filtered],
  );

  const departmentGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        code: string;
        name: string;
        heads: PublicFacultyMember[];
        members: PublicFacultyMember[];
      }
    >();

    for (const member of filtered) {
      const code = member.departmentCode ?? '—';
      const group = groups.get(code) ?? {
        code,
        name: member.departmentName ?? 'Unassigned department',
        heads: [],
        members: [],
      };
      if (member.accountRole === 'department_head') {
        group.heads.push(member);
      } else if (member.accountRole === null) {
        group.members.push(member);
      }
      groups.set(code, group);
    }

    return Array.from(groups.values())
      .filter((group) => group.heads.length + group.members.length > 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [filtered]);

  const typeGroups = useMemo(() => {
    const groups = new Map<string, PublicFacultyMember[]>();
    for (const member of filtered) {
      const key = member.designation?.trim() || 'Unclassified';
      const members = groups.get(key) ?? [];
      members.push(member);
      groups.set(key, members);
    }
    return Array.from(groups, ([label, members]) => ({
      label,
      members,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered]);

  const hasActiveFilters = Boolean(search.trim()) || Boolean(department);
  const leadershipCount = deans.length + secretaries.length;

  return (
    <div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          icon="groups"
          label="Faculty"
          value={data?.total ?? '—'}
          hint="Active faculty in the directory"
          loading={isLoading}
        />
        <StatCard
          icon="badge"
          label="Designations"
          value={
            new Set(
              faculty.map((member) => member.designation).filter(Boolean),
            ).size || '—'
          }
          hint="Distinct roles across the college"
          loading={isLoading}
        />
        <StatCard
          icon="school"
          label="Departments"
          value={data?.departments.length ?? '—'}
          hint="With active faculty"
          loading={isLoading}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="relative block w-full sm:w-80">
          <span className="sr-only">Search faculty</span>
          <Icon
            name="search"
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search faculty or designation…"
            className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-9 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>

        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="h-10 rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        >
          <option value="">All departments</option>
          {(data?.departments ?? []).map((item) => (
            <option key={item.departmentCode} value={item.departmentCode}>
              {item.departmentCode} · {item.facultyCount}
            </option>
          ))}
        </select>

        <div
          className="inline-flex items-center rounded-lg border border-outline-variant bg-surface p-1"
          role="group"
          aria-label="Faculty directory view"
        >
          <button
            type="button"
            onClick={() => setView('tree')}
            aria-pressed={effectiveView === 'tree'}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              effectiveView === 'tree'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <Icon name="account_tree" size={15} />
            Tree
          </button>
          <button
            type="button"
            onClick={() => setView('type')}
            aria-pressed={effectiveView === 'type'}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              effectiveView === 'type'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <Icon name="view_list" size={15} />
            Type
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-on-surface-variant" aria-live="polite">
        Showing <strong className="text-on-surface">{filtered.length}</strong>{' '}
        faculty records.
      </p>

      <PanelState
        loading={isLoading}
        error={isError}
        empty={!isLoading && !isError && filtered.length === 0}
        onRetry={onRetry}
        onClear={
          hasActiveFilters
            ? () => {
                setSearch('');
                setDepartment('');
              }
            : undefined
        }
        emptyTitle={
          faculty.length === 0 ? 'No faculty records yet.' : undefined
        }
        emptyHint={
          faculty.length === 0
            ? 'Faculty records will appear here once they are added to the directory.'
            : undefined
        }
      />

      {!isLoading && !isError && filtered.length > 0 && effectiveView === 'tree' && (
        <div className="mt-4 space-y-4">
          {leadershipCount > 0 && (
            <div className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                    College leadership
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold text-on-surface">
                    Office of the Dean
                  </h3>
                </div>
                <span className="rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {leadershipCount} account{leadershipCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-4 space-y-4 border-l-2 border-primary/20 pl-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    College Dean
                  </p>
                  {deans.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {deans.map((member) => (
                        <FacultyNode key={member.facultyId} member={member} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      No dean account is linked to a faculty record.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    College Secretary
                  </p>
                  {secretaries.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {secretaries.map((member) => (
                        <FacultyNode key={member.facultyId} member={member} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      No college secretary account is linked to a faculty
                      record.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {departmentGroups.map((group) => (
            <div
              key={group.code}
              className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                    {group.code}
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold text-on-surface">
                    {group.name}
                  </h3>
                </div>
                <span className="rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {group.heads.length + group.members.length} faculty
                </span>
              </div>

              <div className="mt-4 space-y-4 border-l-2 border-outline-variant pl-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Department Head
                  </p>
                  {group.heads.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {group.heads.map((member) => (
                        <FacultyNode key={member.facultyId} member={member} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      No department head account is linked.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Faculty
                  </p>
                  {group.members.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {group.members.map((member) => (
                        <FacultyNode key={member.facultyId} member={member} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      No faculty records under this department.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && effectiveView === 'type' && (
        <div className="mt-4 space-y-4">
          {typeGroups.map((group) => (
            <div
              key={group.label}
              className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low px-4 py-3">
                <p className="text-sm font-semibold text-on-surface">
                  {group.label}
                </p>
                <span className="rounded-full border border-outline-variant bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {group.members.length}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-outline-variant text-sm">
                  <thead className="text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    <tr>
                      <th className="px-4 py-3">Faculty</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Account role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/70">
                    {group.members.map((member) => (
                      <tr
                        key={member.facultyId}
                        className="transition-colors hover:bg-surface-container-low/70"
                      >
                        <td className="px-4 py-3 font-semibold text-on-surface">
                          <span className="flex flex-wrap items-center gap-2">
                            {member.fullName}
                            {member.idpLinked && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                <Icon name="link" size={11} />
                                IDP
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-on-surface">
                          {member.departmentCode ?? '—'}
                          {member.departmentName && (
                            <span className="block text-[11px] text-on-surface-variant/70">
                              {member.departmentName}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-on-surface">
                          <RoleBadge role={member.accountRole} />
                          {!member.accountRole && (
                            <span className="text-xs text-on-surface-variant">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-xs leading-relaxed text-on-surface-variant">
        <p className="font-semibold text-on-surface">
          About the public faculty directory
        </p>
        <p className="mt-1">
          Tree view places faculty with a dean, department head, or college
          secretary account by role. Everyone else is listed under their
          department. Type view groups all faculty by designation. Only
          organizational roles are shown — contact details, employee IDs, API
          credentials, webhook secrets, and internal integration endpoints are
          never exposed here.
        </p>
      </div>
    </div>
  );
}

const INTEGRATION_STATE: Record<
  IntegrationState,
  { label: string; body: string; icon: string; tone: string; dot: string }
> = {
  live: {
    label: 'Integration is live',
    body: 'Outbound calls and signed webhooks are configured for this environment.',
    icon: 'task_alt',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10',
    dot: 'bg-emerald-500',
  },
  configured_disabled: {
    label: 'Configured, currently switched off',
    body: 'Credentials are present, but the integration kill switch is off. No outbound calls are made.',
    icon: 'warning',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10',
    dot: 'bg-amber-500',
  },
  incomplete: {
    label: 'Switched on, configuration incomplete',
    body: 'The integration is enabled but a base URL or API key is missing, so no outbound call can succeed.',
    icon: 'warning',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10',
    dot: 'bg-amber-500',
  },
  not_configured: {
    label: 'Not configured yet',
    body: 'No base URL or API key is set for this environment. Faculty sync and schedule pushes are inactive.',
    icon: 'radio_button_unchecked',
    tone: 'border-outline-variant bg-surface-container-low text-on-surface',
    dot: 'bg-slate-400',
  },
};

const MILESTONE_BADGE: Record<
  IntegrationMilestoneStatus,
  { label: string; className: string; icon: string }
> = {
  done: {
    label: 'Shipped',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10',
    icon: 'check_circle',
  },
  in_progress: {
    label: 'In progress',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10',
    icon: 'pending_actions',
  },
  planned: {
    label: 'Planned',
    className:
      'border-outline-variant bg-surface-container text-on-surface-variant',
    icon: 'radio_button_unchecked',
  },
};

function ConnectionRow({
  label,
  configured,
}: {
  label: string;
  configured: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-on-surface">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
          configured
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-on-surface-variant'
        }`}
      >
        <Icon
          name={configured ? 'check_circle' : 'radio_button_unchecked'}
          size={14}
        />
        {configured ? 'Configured' : 'Not set'}
      </span>
    </li>
  );
}

function IntegrationPanel({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: PublicIntegrationStatus | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading || isError || !data) {
    return (
      <PanelState
        loading={isLoading}
        error={isError}
        empty={false}
        onRetry={onRetry}
      />
    );
  }

  const state = INTEGRATION_STATE[data.state];
  const linkedShare =
    data.faculty.total > 0
      ? Math.round((data.faculty.linked / data.faculty.total) * 100)
      : 0;

  return (
    <div className="mt-5">
      <div
        className={`flex flex-wrap items-start gap-3 rounded-2xl border p-4 ${state.tone}`}
      >
        <Icon name={state.icon} size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{state.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-90">
            {state.body}
          </p>
          <p className="mt-1 text-[11px] opacity-70">
            Checked{' '}
            {new Date(data.generatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {data.faculty.lastSyncedAt
              ? ` · last successful faculty sync ${new Date(
                  data.faculty.lastSyncedAt,
                ).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}`
              : ' · no faculty has been synced from IDP yet'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider dark:border-white/15 dark:bg-white/5">
          <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
          {data.service}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon="link"
          label="Faculty linked"
          value={`${data.faculty.linked} / ${data.faculty.total}`}
          hint={`${linkedShare}% delivered by IDP at least once`}
        />
        <StatCard
          icon="pending_actions"
          label="Awaiting first sync"
          value={data.faculty.pending}
          hint="Never delivered by IDP"
        />
        <StatCard
          icon="warning"
          label="Sync failures"
          value={data.faculty.failed}
          hint="Last attempt failed"
        />
        <StatCard
          icon="event_available"
          label="Published entries"
          value={data.published.entries}
          hint={
            data.published.latestTermCode
              ? `Latest term ${data.published.latestTermCode} · ${data.published.terms} term${
                  data.published.terms === 1 ? '' : 's'
                }`
              : 'Nothing published yet'
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,1.15fr]">
        <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            Connection
          </p>
          <h3 className="mt-1 text-base font-semibold text-on-surface">
            What this deployment has configured
          </h3>
          <ul className="mt-2 divide-y divide-outline-variant">
            <ConnectionRow
              label="Pattern A base URL"
              configured={data.connection.baseUrlConfigured}
            />
            <ConnectionRow
              label="Pattern A API key"
              configured={data.connection.apiKeyConfigured}
            />
            <ConnectionRow
              label="Pattern C device key"
              configured={data.connection.deviceApiKeyConfigured}
            />
            <ConnectionRow
              label="Webhook signing secret"
              configured={data.connection.webhookSecretConfigured}
            />
            <ConnectionRow
              label="Pattern A outbound enabled"
              configured={data.connection.enabled}
            />
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
            Pattern C is the primary transport for the offline-capable IDP
            desktop app. Only whether each item is set is published. Values,
            hosts, keys, and secrets are never returned by this page.
          </p>
        </div>

        <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            Delivery plan
          </p>
          <h3 className="mt-1 text-base font-semibold text-on-surface">
            What is working for you today
          </h3>
          <ol className="mt-3 space-y-3">
            {data.milestones.map((milestone) => {
              const badge = MILESTONE_BADGE[milestone.status];
              return (
                <li
                  key={milestone.key}
                  className="rounded-xl border border-outline-variant bg-surface-container-low/60 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-on-surface">
                      {milestone.title}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}
                    >
                      <Icon name={badge.icon} size={12} />
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                    {milestone.summary}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-xs leading-relaxed text-on-surface-variant">
        <p className="font-semibold text-on-surface">
          About this status view
        </p>
        <p className="mt-1">
          Every number here is read from live records, not typed in by hand.
          “Linked” means IDP has delivered that faculty row at least once, so
          the record carries a last-synced timestamp. Drafts, internal review
          rows, and records awaiting approval are excluded from the published
          counts.
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const brandLogo = useAppearanceStore((state) => state.logo);
  const show3dBuilding = useAppearanceStore((state) => state.appearance.show3dBuilding);
  const [tab, setTab] = useState<LandingTab>('schedules');
  const [termId, setTermId] = useState<string | undefined>(undefined);

  const schedules = useQuery({
    queryKey: ['public-schedules', termId ?? 'latest'],
    queryFn: () => fetchPublicSchedules(termId),
    staleTime: 60_000,
  });

  const faculty = useQuery({
    queryKey: ['public-faculty'],
    queryFn: () => fetchPublicFaculty(),
    staleTime: 5 * 60_000,
    // The directory lives in its own tab; do not spend a request on it until
    // the visitor actually opens it.
    enabled: tab === 'faculty',
  });

  const integration = useQuery({
    queryKey: ['public-integration'],
    queryFn: fetchPublicIntegration,
    staleTime: 30_000,
    enabled: tab === 'integration',
  });

  const dashboardPath = !user
    ? '/login'
    : profile?.role === 'administrator' ||
        profile?.role === 'college_dean' ||
        profile?.role === 'college_secretary'
      ? '/dean/dashboard'
      : '/dashboard';

  const selectedTermId = termId ?? schedules.data?.term?.termId ?? '';

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const goToTab = (next: LandingTab) => {
    setTab(next);
    requestAnimationFrame(() => {
      document.getElementById('public-data')?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="min-h-screen bg-background text-on-background">
      <WmsuIntro />
      <a
        href="#public-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-primary"
      >
        Skip to public data
      </a>
      <header className="no-print sticky top-0 z-40 border-b border-outline-variant bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="group flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden">
              {brandLogo ? (
                <img
                  src={brandLogo}
                  alt="CoE-NNECT logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <CetLogo variant="mark" className="h-full w-full" />
              )}
            </span>
            <span>
              <span className="block text-sm font-extrabold tracking-tight text-on-surface">
                CoE-NNECT
              </span>
              <span className="block text-[11px] text-on-surface-variant">
                WMSU · College of Engineering
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            <button
              type="button"
              onClick={() => goToTab('schedules')}
              className={`transition hover:text-primary ${
                tab === 'schedules' ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              Published schedules
            </button>
            <button
              type="button"
              onClick={() => goToTab('planner')}
              className={`transition hover:text-primary ${
                tab === 'planner' ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              Student planner
            </button>
            <button
              type="button"
              onClick={() => goToTab('faculty')}
              className={`transition hover:text-primary ${
                tab === 'faculty' ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              Faculty directory
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline-variant bg-surface">
              <ThemeToggle />
            </div>
            <ThemeStyleMenu />
            <Link
              to={dashboardPath}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              <Icon name={user ? 'dashboard' : 'login'} size={17} />
              <span className="hidden sm:inline">
                {user ? 'Open dashboard' : 'Sign in'}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <section className="no-print relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-container text-white">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="landing-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="white"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#landing-grid)" />
        </svg>
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.15fr,1.15fr] lg:px-8">
          <div className="py-16 lg:py-24">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/85">
                <Icon name="public" size={14} />
                Public schedule portal
              </span>
              {schedules.data?.term && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/75">
                  <Icon name="event_available" size={13} />
                  {schedules.data.term.termCode ??
                    schedules.data.term.termName}
                </span>
              )}
            </div>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              <span className="landing-accent">College of Engineering</span>
              <span className="mt-2 block text-2xl font-semibold text-white/75 sm:text-3xl">
                class schedules, in one place.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
              Browse officially published schedules, check room and instructor
              assignments, build a personal weekly plan, and look up the
              college faculty directory by department and designation.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => goToTab('schedules')}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-white/90"
              >
                Browse schedules
                <Icon name="arrow_downward" size={16} />
              </button>
              <button
                type="button"
                onClick={() => goToTab('planner')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <Icon name="calendar_month" size={16} />
                Plan my schedule
              </button>
              <Link
                to={dashboardPath}
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <Icon name={user ? 'dashboard' : 'login'} size={16} />
                {user ? 'Open dashboard' : 'Sign in to manage'}
              </Link>
            </div>
          </div>

          <div className="h-full min-h-[320px] w-full lg:min-h-[480px]">
            <Suspense
              fallback={
                <div className="h-full w-full" />
              }
            >
              {show3dBuilding && <CoeBuildingViewerLazy />}
            </Suspense>
          </div>
        </div>
      </section>

      <main
        id="public-content"
        className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-16 pt-10 sm:px-6 lg:px-8 print:p-0"
      >
        <div className="no-print">
          <IdpAppPromo />
        </div>

        <section aria-labelledby="portal-highlights" className="no-print mb-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2
              id="portal-highlights"
              className="text-2xl font-semibold text-on-surface"
            >
              What you can do here
            </h2>
            <p className="max-w-md text-xs leading-relaxed text-on-surface-variant">
              Public schedules and faculty records, no account needed. Sign in
              when you are ready to manage your department.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
            <FeatureCard
              icon="schedule"
              title="Find a class"
              body="Filter by term or department, then search by subject, section, instructor, or room."
              actionLabel="Browse schedules"
              onAction={() => goToTab('schedules')}
              featured
              className="lg:col-span-7"
            />
            <FeatureCard
              icon="calendar_month"
              title="Build your week"
              body="Add published classes by year and section, create personal blocks, and export your plan as PDF or PNG."
              actionLabel="Open planner"
              onAction={() => goToTab('planner')}
              className="lg:col-span-5"
            />
            <FeatureCard
              icon="groups"
              title="Look up faculty"
              body="See active faculty by department, with their designation and department assignment."
              actionLabel="Open directory"
              onAction={() => goToTab('faculty')}
              className="lg:col-span-5"
            />
            <FeatureCard
              icon="dashboard"
              title="Manage your department"
              body="Department heads build and publish timetables; the dean and secretary oversee the college."
              actionLabel={user ? 'Open dashboard' : 'Sign in to manage'}
              to={dashboardPath}
              featured
              className="lg:col-span-7"
            />
          </div>
        </section>

        <section
          id="public-data"
          aria-labelledby="public-data-title"
          className="scroll-mt-24"
        >
          <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="public-data-title"
                className="text-2xl font-semibold text-on-surface"
              >
                Browse the college
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                Published schedules, a student planner, and faculty records,
                refreshed automatically.
              </p>
            </div>
            {(tab === 'schedules' || tab === 'planner') &&
              schedules.data?.generatedAt && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 text-[11px] text-on-surface-variant">
                  <Icon name="schedule" size={13} />
                  Updated{' '}
                  {new Date(schedules.data.generatedAt).toLocaleString(
                    undefined,
                    {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    },
                  )}
                </span>
              )}
          </div>

          <div className="no-print relative flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant">
            <div
              role="tablist"
              aria-label="Public data views"
              className="-mx-4 flex max-w-full snap-x gap-5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              <TabButton
                id="tab-schedules"
                active={tab === 'schedules'}
                icon="schedule"
                onClick={() => setTab('schedules')}
              >
                Published schedules
              </TabButton>
              <TabButton
                id="tab-planner"
                active={tab === 'planner'}
                icon="calendar_month"
                onClick={() => setTab('planner')}
              >
                Student planner
              </TabButton>
              <TabButton
                id="tab-faculty"
                active={tab === 'faculty'}
                icon="groups"
                onClick={() => setTab('faculty')}
              >
                Faculty directory
              </TabButton>
              <TabButton
                id="tab-integration"
                active={tab === 'integration'}
                icon="link"
                onClick={() => setTab('integration')}
              >
                IDP integration
              </TabButton>
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent sm:hidden"
              aria-hidden="true"
            />
          </div>

          <div
            role="tabpanel"
            id="public-panel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === 'schedules' && (
              <SchedulesPanel
                data={schedules.data}
                isLoading={schedules.isLoading}
                isError={schedules.isError}
                onRetry={() => void schedules.refetch()}
                selectedTermId={selectedTermId}
                onTermChange={(next) => setTermId(next)}
              />
            )}
            {tab === 'planner' && (
              <Suspense
                fallback={
                  <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface py-16 text-sm text-on-surface-variant">
                    <Icon name="progress_activity" size={18} spin />
                    Loading planner…
                  </div>
                }
              >
                <StudentPlannerPanelLazy
                  data={schedules.data}
                  isLoading={schedules.isLoading}
                  isError={schedules.isError}
                  onRetry={() => void schedules.refetch()}
                  selectedTermId={selectedTermId}
                  onTermChange={(next) => setTermId(next)}
                />
              </Suspense>
            )}
            {tab === 'faculty' && (
              <FacultyPanel
                data={faculty.data}
                isLoading={faculty.isPending}
                isError={faculty.isError}
                onRetry={() => void faculty.refetch()}
              />
            )}
            {tab === 'integration' && (
              <IntegrationPanel
                data={integration.data}
                isLoading={integration.isPending}
                isError={integration.isError}
                onRetry={() => void integration.refetch()}
              />
            )}
          </div>
        </section>
      </main>

      <footer className="no-print landing-footer border-t border-white/10">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr,1fr,1fr]">
            <div>
              <Link to="/" className="inline-flex items-center gap-3">
                {brandLogo ? (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 p-1 text-white ring-1 ring-white/10">
                    <img
                      src={brandLogo}
                      alt="CoE-NNECT logo"
                      className="h-full w-full object-contain"
                    />
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CetLogo variant="mark" className="h-10 w-10" />
                    <WmsuSeal className="h-10 w-10" />
                  </span>
                )}
                <span>
                  <span className="block text-sm font-extrabold tracking-tight text-white">
                    CoE-NNECT
                  </span>
                  <span className="block text-[11px] text-white/60">
                    WMSU · College of Engineering
                  </span>
                </span>
              </Link>
              <p className="mt-4 max-w-sm text-xs leading-relaxed text-white/65">
                The public scheduling portal of the WMSU College of Engineering.
                Browse officially published class schedules, build a personal
                weekly plan, and look up the college faculty directory.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                  aria-hidden="true"
                />
                Public data only
              </span>
            </div>

            <nav aria-label="Portal links">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                Portal
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => goToTab('schedules')}
                    className="text-left text-white/70 transition-colors hover:text-[#facc15] dark:hover:text-[rgb(var(--accent-tint))]"
                  >
                    Published schedules
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => goToTab('planner')}
                    className="text-left text-white/70 transition-colors hover:text-[#facc15] dark:hover:text-[rgb(var(--accent-tint))]"
                  >
                    Student planner
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => goToTab('faculty')}
                    className="text-left text-white/70 transition-colors hover:text-[#facc15] dark:hover:text-[rgb(var(--accent-tint))]"
                  >
                    Faculty directory
                  </button>
                </li>
                {IDP_APP_URL && (
                  <li>
                    <a
                      href={IDP_APP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/70 transition-colors hover:text-[#facc15] dark:hover:text-[rgb(var(--accent-tint))]"
                    >
                      {IDP_APP_NAME}
                    </a>
                  </li>
                )}
                <li>
                  <Link
                    to={dashboardPath}
                    className="text-white/70 transition-colors hover:text-[#facc15] dark:hover:text-[rgb(var(--accent-tint))]"
                  >
                    {user ? 'Open dashboard' : 'Sign in to manage'}
                  </Link>
                </li>
                <li>
                  <a
                    href="#public-content"
                    className="text-white/70 transition-colors hover:text-[#facc15] dark:hover:text-[rgb(var(--accent-tint))]"
                  >
                    Back to public data
                  </a>
                </li>
              </ul>
            </nav>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                About this portal
              </p>
              <p className="mt-4 text-xs leading-relaxed text-white/65">
                Only published schedules are shown. Drafts, flagged entries,
                and records awaiting approval stay internal. Contact details,
                employee IDs, and integration credentials are never exposed.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-white/45">
                For corrections, contact your Department Head or the College
                Dean.
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-[11px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} Western Mindanao State University ·
              College of Engineering
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <p>Built by the Department of Computer Engineering</p>
              <button
                type="button"
                onClick={scrollToTop}
                className="inline-flex items-center gap-1.5 text-white/60 transition-colors hover:text-[#facc15] dark:hover:text-[rgb(var(--accent-tint))]"
              >
                <Icon name="arrow_upward" size={13} />
                Back to top
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
