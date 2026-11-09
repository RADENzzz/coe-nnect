import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import Icon from '../../components/ui/Icon';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchPublicFaculty,
  fetchPublicOverview,
  fetchPublicSchedules,
  type PublicFaculty,
  type PublicSchedules,
} from '../../api/public.api';

type LandingTab = 'schedules' | 'faculty';

const DAY_TONE: Record<string, string> = {
  Monday: 'bg-rose-50 text-rose-700 border-rose-200',
  Tuesday: 'bg-amber-50 text-amber-700 border-amber-200',
  Wednesday: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Thursday: 'bg-sky-50 text-sky-700 border-sky-200',
  Friday: 'bg-violet-50 text-violet-700 border-violet-200',
  Saturday: 'bg-slate-100 text-slate-700 border-slate-200',
  Sunday: 'bg-slate-100 text-slate-700 border-slate-200',
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon name={icon} size={16} />
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function TabButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold transition ${
        active
          ? 'border-[#5c1219] text-[#5c1219]'
          : 'border-transparent text-slate-500 hover:text-slate-800'
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
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Icon name="progress_activity" size={18} spin />
        Loading public data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="warning" size={28} className="text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Public data is temporarily unavailable.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Please try again in a moment.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-[#5c1219] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Icon name="search_off" size={28} className="text-slate-400" />
        <p className="text-sm font-semibold text-slate-800">
          No matching records.
        </p>
        <p className="text-xs text-slate-500">
          Try clearing the search or choosing a different filter.
        </p>
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

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Academic term
            </span>
            <select
              value={selectedTermId}
              onChange={(event) => onTermChange(event.target.value)}
              disabled={!data?.terms.length}
              className="h-10 min-w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10 disabled:opacity-50"
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
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Department
            </span>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="h-10 min-w-36 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
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
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject, section, faculty, room…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Showing <strong className="text-slate-700">{filtered.length}</strong> of{' '}
        {entries.length} published class blocks
        {data?.term ? ` for ${data.term.termCode ?? data.term.termName}` : ''}.
      </p>

      <PanelState
        loading={isLoading}
        error={isError}
        empty={!isLoading && !isError && filtered.length === 0}
        onRetry={onRetry}
      />

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={entry.scheduleId} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                          DAY_TONE[entry.dayOfWeek] ??
                          'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {entry.dayOfWeek}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                      {entry.startTime}–{entry.endTime}
                    </td>
                    <td className="min-w-48 px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {entry.subjectCode ?? '—'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.subjectTitle ?? 'Untitled subject'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {entry.sectionCode ?? '—'}
                    </td>
                    <td className="min-w-44 px-4 py-3 text-slate-700">
                      {entry.facultyName ??
                        entry.externalFacultyName ??
                        'Unassigned'}
                    </td>
                    <td className="min-w-32 px-4 py-3 text-slate-700">
                      {entry.roomNumber ?? entry.externalRoomName ?? '—'}
                      {entry.building && (
                        <span className="block text-[11px] text-slate-400">
                          {entry.building}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
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
  const [idpOnly, setIdpOnly] = useState(false);

  const faculty = useMemo(() => data?.faculty ?? [], [data?.faculty]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return faculty.filter((member) => {
      if (department && member.departmentCode !== department) return false;
      if (idpOnly && !member.idpLinked) return false;
      if (!needle) return true;
      return [member.fullName, member.departmentCode, member.designation]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [department, faculty, idpOnly, search]);

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
          icon="link"
          label="IDP-linked"
          value={data?.idpLinked ?? '—'}
          hint="Records connected to the IDP"
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
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search faculty or designation…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
          />
        </label>

        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
        >
          <option value="">All departments</option>
          {(data?.departments ?? []).map((item) => (
            <option key={item.departmentCode} value={item.departmentCode}>
              {item.departmentCode} · {item.facultyCount}
            </option>
          ))}
        </select>

        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={idpOnly}
            onChange={(event) => setIdpOnly(event.target.checked)}
            className="h-4 w-4 accent-[#5c1219]"
          />
          IDP-linked only
        </label>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Showing <strong className="text-slate-700">{filtered.length}</strong>{' '}
        faculty records.
      </p>

      <PanelState
        loading={isLoading}
        error={isError}
        empty={!isLoading && !isError && filtered.length === 0}
        onRetry={onRetry}
      />

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Faculty</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">IDP connection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((member) => (
                  <tr key={member.facultyId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {member.fullName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {member.departmentCode ?? '—'}
                      {member.departmentName && (
                        <span className="block text-[11px] text-slate-400">
                          {member.departmentName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {member.designation ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          member.idpLinked
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Icon
                          name={member.idpLinked ? 'check_circle' : 'link'}
                          size={13}
                        />
                        {member.idpLinked ? 'IDP-linked' : 'Not linked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-700">
          About the public faculty directory
        </p>
        <p className="mt-1">
          This view shows names, departments, designations, and whether a record
          is connected to the university&apos;s Institutional Data Platform
          (IDP). Contact details, employee IDs, API credentials, webhook
          secrets, and internal integration endpoints are never exposed here.
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

  const dashboardPath = !user
    ? '/login'
    : profile?.role === 'administrator' ||
        profile?.role === 'college_dean' ||
        profile?.role === 'college_secretary'
      ? '/dean/dashboard'
      : '/dashboard';

  const selectedTermId = termId ?? schedules.data?.term?.termId ?? '';

  const goToTab = (next: LandingTab) => {
    setTab(next);
    requestAnimationFrame(() => {
      document
        .getElementById('public-content')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center bg-[#5c1219] text-white">
              <Icon name="school" filled size={22} />
            </span>
            <span>
              <span className="block text-sm font-extrabold tracking-tight text-slate-900">
                CoE-NNECT
              </span>
              <span className="block text-[11px] text-slate-500">
                WMSU · College of Engineering
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
            <button
              type="button"
              onClick={() => goToTab('schedules')}
              className="transition hover:text-[#5c1219]"
            >
              Published schedules
            </button>
            <button
              type="button"
              onClick={() => goToTab('faculty')}
              className="transition hover:text-[#5c1219]"
            >
              Faculty &amp; IDP
            </button>
          </nav>

          <Link
            to={dashboardPath}
            className="inline-flex items-center gap-2 rounded-lg bg-[#5c1219] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Icon name={user ? 'dashboard' : 'login'} size={17} />
            <span className="hidden sm:inline">
              {user ? 'Open dashboard' : 'Sign in'}
            </span>
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#5c1219] text-white">
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

        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.35fr,1fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
              <Icon name="public" size={14} />
              Public schedule portal
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              College of Engineering
              <br />
              <span className="text-white/50">class schedules, in one place.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Browse officially published schedules, check room and instructor
              assignments, and see which faculty records are connected to the
              university&apos;s Institutional Data Platform.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => goToTab('schedules')}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[#5c1219] transition hover:bg-white/90"
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

          <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
              Current public snapshot
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                <dt className="text-white/65">Published class blocks</dt>
                <dd className="font-extrabold">
                  {overview.data?.publishedEntries ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                <dt className="text-white/65">Published terms</dt>
                <dd className="font-extrabold">
                  {overview.data?.publishedTerms ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                <dt className="text-white/65">Active faculty</dt>
                <dd className="font-extrabold">
                  {overview.data?.activeFaculty ?? '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-white/65">IDP-linked faculty</dt>
                <dd className="font-extrabold">
                  {overview.data?.idpLinkedFaculty ?? '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-white/45">
              Only published schedules are shown. Drafts, flagged rows, and
              entries waiting on faculty approval stay internal.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon="schedule"
            label="Published classes"
            value={overview.data?.publishedEntries ?? '—'}
            hint="Visible on this portal"
          />
          <StatCard
            icon="school"
            label="Departments"
            value={overview.data?.activeDepartments ?? '—'}
            hint="Active engineering departments"
          />
          <StatCard
            icon="groups"
            label="Faculty"
            value={overview.data?.activeFaculty ?? '—'}
            hint="Active faculty records"
          />
          <StatCard
            icon="link"
            label="IDP-linked"
            value={overview.data?.idpLinkedFaculty ?? '—'}
            hint="Connected to the IDP"
          />
        </div>
      </div>

      <main
        id="public-content"
        className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-16 pt-10 sm:px-6 lg:px-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200">
          <div className="flex gap-5">
            <TabButton
              active={tab === 'schedules'}
              icon="schedule"
              onClick={() => setTab('schedules')}
            >
              Published schedules
            </TabButton>
            <TabButton
              active={tab === 'faculty'}
              icon="groups"
              onClick={() => setTab('faculty')}
            >
              Faculty &amp; IDP
            </TabButton>
          </div>
          {schedules.data?.generatedAt && (
            <p className="pb-3 text-[11px] text-slate-400">
              Snapshot generated{' '}
              {new Date(schedules.data.generatedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}
        </div>

        {tab === 'schedules' ? (
          <SchedulesPanel
            data={schedules.data}
            isLoading={schedules.isLoading}
            isError={schedules.isError}
            onRetry={() => void schedules.refetch()}
            selectedTermId={selectedTermId}
            onTermChange={(next) => setTermId(next)}
          />
        ) : (
          <FacultyPanel
            data={faculty.data}
            isLoading={faculty.isLoading}
            isError={faculty.isError}
            onRetry={() => void faculty.refetch()}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} Western Mindanao State University ·
            College of Engineering
          </p>
          <p className="sm:text-right">
            Public data only. For corrections, contact your department head or
            the College Dean.
          </p>
        </div>
      </footer>
    </div>
  );
}
