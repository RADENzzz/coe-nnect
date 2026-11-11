import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import Icon from '../../components/ui/Icon';
import ThemeToggle from '../../components/ui/ThemeToggle';
import ThemeStyleMenu from '../../components/ui/ThemeStyleMenu';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchPublicFaculty,
  fetchPublicIntegration,
  fetchPublicOverview,
  fetchPublicSchedules,
  type IntegrationMilestoneStatus,
  type IntegrationState,
  type PublicFaculty,
  type PublicIntegrationStatus,
  type PublicSchedules,
} from '../../api/public.api';

type LandingTab = 'schedules' | 'faculty' | 'integration';

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
}: {
  icon: string;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2 text-on-surface-variant">
        <Icon name={icon} size={16} />
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-on-surface">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
  to,
}: {
  icon: string;
  eyebrow: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction?: () => void;
  to?: string;
}) {
  const actionClasses =
    'mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80';

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-outline-variant bg-surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" />
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
        <Icon name={icon} size={19} />
      </span>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
        {eyebrow}
      </p>
      <h3 className="mt-1 text-base font-semibold text-on-surface">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-on-surface-variant">
        {body}
      </p>
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
  );
}

function HeroStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-extrabold text-white">{value}</dd>
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
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-on-surface-variant">
        <Icon name="progress_activity" size={18} spin />
        Loading public data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="warning" size={28} className="text-amber-500" />
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
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Icon name="search_off" size={28} className="text-on-surface-variant" />
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

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          entries
            .map((entry) => entry.departmentCode)
            .filter((code): code is string => Boolean(code)),
        ),
      ).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (department && entry.departmentCode !== department) return false;
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
  }, [entries, department, search]);

  const hasActiveFilters = Boolean(search.trim()) || Boolean(department);

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
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
              className="h-10 min-w-36 rounded-lg border border-outline-variant bg-surface px-3 text-sm font-medium text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              <option value="">All departments</option>
              {departments.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search published schedules</span>
          <Icon
            name="search"
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject, section, faculty, room…"
            className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-9 pr-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-on-surface-variant" aria-live="polite">
        Showing{' '}
        <strong className="text-on-surface">{filtered.length}</strong> of{' '}
        {entries.length} published class blocks
        {data?.term ? ` for ${data.term.termCode ?? data.term.termName}` : ''}.
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
          entries.length === 0 ? 'No published schedules yet.' : undefined
        }
        emptyHint={
          entries.length === 0
            ? 'Published class blocks will appear here once the college publishes them.'
            : undefined
        }
      />

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-outline-variant text-sm">
              <thead className="bg-surface-container-low text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Instructor</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Dept</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/70">
                {filtered.map((entry) => (
                  <tr
                    key={entry.scheduleId}
                    className="transition-colors hover:bg-surface-container-low/70"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                          DAY_TONE[entry.dayOfWeek] ??
                          'border-outline-variant bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {entry.dayOfWeek}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-on-surface-variant">
                      {entry.startTime}–{entry.endTime}
                    </td>
                    <td className="min-w-48 px-4 py-3">
                      <p className="font-semibold text-on-surface">
                        {entry.subjectCode ?? '—'}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {entry.subjectTitle ?? 'Untitled subject'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-on-surface">
                      {entry.sectionCode ?? '—'}
                    </td>
                    <td className="min-w-44 px-4 py-3 text-on-surface">
                      {entry.facultyName ??
                        entry.externalFacultyName ??
                        'Unassigned'}
                    </td>
                    <td className="min-w-32 px-4 py-3 text-on-surface">
                      {entry.roomNumber ?? entry.externalRoomName ?? '—'}
                      {entry.building && (
                        <span className="block text-[11px] text-on-surface-variant/70">
                          {entry.building}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
                        {entry.departmentCode ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

  const faculty = useMemo(() => data?.faculty ?? [], [data?.faculty]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return faculty.filter((member) => {
      if (department && member.departmentCode !== department) return false;
      if (!needle) return true;
      return [member.fullName, member.departmentCode, member.designation]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [department, faculty, search]);

  const hasActiveFilters = Boolean(search.trim()) || Boolean(department);

  return (
    <div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          icon="groups"
          label="Faculty"
          value={data?.total ?? '—'}
          hint="Active faculty in the directory"
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
        />
        <StatCard
          icon="school"
          label="Departments"
          value={data?.departments.length ?? '—'}
          hint="With active faculty"
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

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-outline-variant text-sm">
              <thead className="bg-surface-container-low text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Faculty</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Designation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/70">
                {filtered.map((member) => (
                  <tr
                    key={member.facultyId}
                    className="transition-colors hover:bg-surface-container-low/70"
                  >
                    <td className="px-4 py-3 font-semibold text-on-surface">
                      {member.fullName}
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
                      {member.designation ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-xs leading-relaxed text-on-surface-variant">
        <p className="font-semibold text-on-surface">
          About the public faculty directory
        </p>
        <p className="mt-1">
          This view shows active faculty names, departments, and designations.
          Contact details, employee IDs, API credentials, webhook secrets, and
          internal integration endpoints are never exposed here.
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
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  configured_disabled: {
    label: 'Configured, currently switched off',
    body: 'Credentials are present, but the integration kill switch is off. No outbound calls are made.',
    icon: 'warning',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  incomplete: {
    label: 'Switched on, configuration incomplete',
    body: 'The integration is enabled but a base URL or API key is missing, so no outbound call can succeed.',
    icon: 'warning',
    tone: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
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
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    icon: 'check_circle',
  },
  in_progress: {
    label: 'In progress',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
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
  const [tab, setTab] = useState<LandingTab>('schedules');
  const [termId, setTermId] = useState<string | undefined>(undefined);

  const overview = useQuery({
    queryKey: ['public-overview'],
    queryFn: fetchPublicOverview,
    staleTime: 60_000,
  });

  const schedules = useQuery({
    queryKey: ['public-schedules', termId ?? 'latest'],
    queryFn: () => fetchPublicSchedules(termId),
    staleTime: 60_000,
  });

  const faculty = useQuery({
    queryKey: ['public-faculty'],
    queryFn: () => fetchPublicFaculty(),
    staleTime: 5 * 60_000,
  });

  const integration = useQuery({
    queryKey: ['public-integration'],
    queryFn: fetchPublicIntegration,
    staleTime: 30_000,
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
      <a
        href="#public-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-primary"
      >
        Skip to public data
      </a>
      <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="group flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center bg-primary text-on-primary">
              <Icon name="school" filled size={22} />
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

      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-container text-white">
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

        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.3fr,1fr] lg:items-center lg:px-8 lg:py-24">
          <div>
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
              assignments, and look up the college faculty directory by
              department and designation.
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
              <Link
                to={dashboardPath}
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <Icon name={user ? 'dashboard' : 'login'} size={16} />
                {user ? 'Open dashboard' : 'Sign in to manage'}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
              At a glance
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <HeroStat
                label="Published class blocks"
                value={overview.data?.publishedEntries ?? '—'}
              />
              <HeroStat
                label="Published terms"
                value={overview.data?.publishedTerms ?? '—'}
              />
              <HeroStat
                label="Active faculty"
                value={overview.data?.activeFaculty ?? '—'}
              />
              <HeroStat
                label="Active departments"
                value={overview.data?.activeDepartments ?? '—'}
              />
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-white/60">
              Only published schedules are shown. Drafts, flagged rows, and
              entries awaiting faculty approval stay internal.
            </p>
          </div>
        </div>
      </section>

      <main
        id="public-content"
        className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-16 pt-10 sm:px-6 lg:px-8"
      >
        <IdpAppPromo />

        <section aria-labelledby="portal-highlights" className="mb-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                Explore the portal
              </p>
              <h2
                id="portal-highlights"
                className="mt-1 text-2xl font-semibold text-on-surface"
              >
                What you can do here
              </h2>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-on-surface-variant">
              Public schedules and faculty records, no account needed. Sign in
              when you are ready to manage your department.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon="schedule"
              eyebrow="Schedules"
              title="Find a class"
              body="Filter by term or department, then search by subject, section, instructor, or room."
              actionLabel="Browse schedules"
              onAction={() => goToTab('schedules')}
            />
            <FeatureCard
              icon="groups"
              eyebrow="Directory"
              title="Look up faculty"
              body="See active faculty by department, with their designation and department assignment."
              actionLabel="Open directory"
              onAction={() => goToTab('faculty')}
            />
            <FeatureCard
              icon="dashboard"
              eyebrow="Workspace"
              title="Manage your department"
              body="Department heads build and publish timetables; the dean and secretary oversee the college."
              actionLabel={user ? 'Open dashboard' : 'Sign in to manage'}
              to={dashboardPath}
            />
          </div>
        </section>

        <section
          id="public-data"
          aria-labelledby="public-data-title"
          className="scroll-mt-24"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                Public data
              </p>
              <h2
                id="public-data-title"
                className="mt-1 text-2xl font-semibold text-on-surface"
              >
                Browse the college
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                Published schedules and faculty records, refreshed
                automatically.
              </p>
            </div>
            {tab === 'schedules' && schedules.data?.generatedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 text-[11px] text-on-surface-variant">
                <Icon name="schedule" size={13} />
                Updated{' '}
                {new Date(schedules.data.generatedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant">
            <div
              role="tablist"
              aria-label="Public data views"
              className="flex max-w-full gap-5 overflow-x-auto [scrollbar-width:thin]"
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
            {tab === 'faculty' && (
              <FacultyPanel
                data={faculty.data}
                isLoading={faculty.isLoading}
                isError={faculty.isError}
                onRetry={() => void faculty.refetch()}
              />
            )}
            {tab === 'integration' && (
              <IntegrationPanel
                data={integration.data}
                isLoading={integration.isLoading}
                isError={integration.isError}
                onRetry={() => void integration.refetch()}
              />
            )}
          </div>
        </section>
      </main>

      <footer className="landing-footer border-t border-white/10">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr,1fr,1fr]">
            <div>
              <Link to="/" className="inline-flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/10">
                  <Icon name="school" filled size={22} />
                </span>
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
                Browse officially published class schedules and the college
                faculty directory.
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
