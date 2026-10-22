import { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import {
  fetchSystemState,
  startSeed,
  startReset,
  fetchJob,
  listDevUsers,
  resetUserPassword,
  renameUser,
  toggleDevUserActive,
  fetchSystemStatusForDev,
  type DevJob,
  type DevUserRecord,
} from '../../api/dev-tools.api';
import {
  updateSystemStatus,
  type SystemStatusSeverity,
} from '../../api/system-status.api';
import { useOnlineUsers } from '../../hooks/use-online-users';
import { useAuthStore } from '../../store/auth.store';

const DEMO_PASSWORD = 'Demo!2345';
const RESET_CONFIRM_PHRASE = 'RESET DEMO DATA';
const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;

const ROLE_TONE: Record<string, { label: string; className: string }> = {
  administrator: {
    label: 'Dev',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  college_dean: {
    label: 'Dean',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  department_head: {
    label: 'Dept Head',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  viewer: {
    label: 'Viewer',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
  },
};

const STATUS_ROWS: { key: string; label: string; icon: string }[] = [
  { key: 'schedules', label: 'Schedules', icon: 'calendar_view_month' },
  { key: 'faculty', label: 'Faculty', icon: 'groups' },
  { key: 'subjects', label: 'Subjects', icon: 'menu_book' },
  { key: 'sections', label: 'Sections', icon: 'view_module' },
  { key: 'prospectus', label: 'Prospectus', icon: 'library_books' },
  { key: 'users', label: 'Users', icon: 'manage_accounts' },
  { key: 'department', label: 'Departments', icon: 'corporate_fare' },
  { key: 'notification', label: 'Notifications', icon: 'notifications' },
];

export default function DevToolsPage() {
  const currentUser = useAuthStore((state) => state.user);

  const queryClient = useQueryClient();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const { onlineUsers, isConnected } = useOnlineUsers();
  const onlineUserIds = useMemo(
    () => new Set(onlineUsers.map((user) => user.user_id)),
    [onlineUsers],
  );

  const {
    data: state,
    refetch: refetchState,
    isLoading: stateLoading,
  } = useQuery({
    queryKey: ['dev-tools', 'state'],
    queryFn: fetchSystemState,
    refetchInterval: 8_000,
  });

  const {
    data: users = [],
    refetch: refetchUsers,
    isLoading: usersLoading,
  } = useQuery({
    queryKey: ['dev-tools', 'users'],
    queryFn: listDevUsers,
  });

  const [activeJob, setActiveJob] = useState<DevJob | null>(null);
  const [lastJobResult, setLastJobResult] = useState<{
    kind: 'seed' | 'reset';
    status: 'success' | 'failed';
    finishedAt: number;
  } | null>(null);
  const [now, setNow] = useState(Date.now());

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [seedModalOpen, setSeedModalOpen] = useState(false);

  const [passwordTarget, setPasswordTarget] = useState<DevUserRecord | null>(
    null,
  );
  const [newPassword, setNewPassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);

  const [renameTarget, setRenameTarget] = useState<DevUserRecord | null>(null);
  const [newUsername, setNewUsername] = useState('');

  const [searchQuery, setSearchQuery] = useState('');

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<DevUserRecord | null>(
    null,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!lastJobResult) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lastJobResult]);

  useEffect(() => {
    if (!actionSuccess) return;
    const t = setTimeout(() => setActionSuccess(null), 5_000);
    return () => clearTimeout(t);
  }, [actionSuccess]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  const pwChecks = useMemo(
    () => ({
      length: newPassword.length >= 8,
      upper: /[A-Z]/.test(newPassword),
      lower: /[a-z]/.test(newPassword),
      digit: /\d/.test(newPassword),
      symbol: /[^A-Za-z0-9]/.test(newPassword),
    }),
    [newPassword],
  );
  const pwValid = Object.values(pwChecks).every(Boolean);

  const renameValid =
    !!newUsername &&
    USERNAME_RE.test(newUsername) &&
    newUsername !== renameTarget?.username;

  const startPolling = (jobId: string, kind: 'seed' | 'reset') => {
    const poll = async () => {
      try {
        const job = await fetchJob(jobId);
        if (!mounted.current || !job) return;
        setActiveJob(job);
        if (job.status === 'running') {
          pollTimer.current = setTimeout(poll, 1500);
        } else {
          setLastJobResult({
            kind,
            status: job.status === 'success' ? 'success' : 'failed',
            finishedAt: Date.now(),
          });
          setNow(Date.now());
          queryClient.invalidateQueries({ queryKey: ['dev-tools'] });
        }
      } catch {
        if (mounted.current) {
          setLastJobResult({ kind, status: 'failed', finishedAt: Date.now() });
          setNow(Date.now());
        }
      }
    };
    poll();
  };

  const seedMutation = useMutation({
    mutationFn: startSeed,
    onSuccess: ({ jobId }) => {
      setSeedModalOpen(false);
      setActionError(null);
      setActionSuccess(null);
      startPolling(jobId, 'seed');
    },
    onError: (err: any) => setActionError(err?.message ?? 'Seed failed'),
  });

  const resetMutation = useMutation({
    mutationFn: startReset,
    onSuccess: ({ jobId }) => {
      setResetModalOpen(false);
      setResetPhrase('');
      setActionError(null);
      setActionSuccess(null);
      startPolling(jobId, 'reset');
    },
    onError: (err: any) => setActionError(err?.message ?? 'Reset failed'),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ userId, pw }: { userId: string; pw: string }) =>
      resetUserPassword(userId, pw),
    onSuccess: (_data, variables) => {
      const target = users.find((u) => u.userId === variables.userId);
      setPasswordTarget(null);
      setNewPassword('');
      setPasswordCopied(false);
      setActionError(null);
      setActionSuccess(`Password updated for "${target?.username ?? 'user'}".`);
      refetchUsers();
    },
    onError: (err: any) =>
      setActionError(
        err?.response?.data?.message ?? err?.message ?? 'Password reset failed',
      ),
  });

  const renameMutation = useMutation({
    mutationFn: ({ userId, name }: { userId: string; name: string }) =>
      renameUser(userId, name),
    onSuccess: (data) => {
      setRenameTarget(null);
      setNewUsername('');
      setActionError(null);
      setActionSuccess(`Renamed to "${data.username}".`);
      refetchUsers();
    },
    onError: (err: any) =>
      setActionError(
        err?.response?.data?.message ?? err?.message ?? 'Rename failed',
      ),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: toggleDevUserActive,
    onSuccess: (data) => {
      setDeactivateTarget(null);
      setActionError(null);
      setActionSuccess(
        `User is now ${data.isActive ? 'Active' : 'Deactivated'}.`,
      );
      refetchUsers();
    },
    onError: (err: any) =>
      setActionError(
        err?.response?.data?.message ?? err?.message ?? 'Toggle failed',
      ),
  });

  const isBusy =
    activeJob?.status === 'running' ||
    seedMutation.isPending ||
    resetMutation.isPending;

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      /* clipboard may be blocked — silent fail */
    }
  };

  const formatRelativeTime = (ts: number) => {
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (activeJob?.status === 'running') {
      if (!jobStartedAt) setJobStartedAt(Date.now());
    } else {
      setJobStartedAt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.status]);

  const openResetModal = () => {
    setResetPhrase('');
    setResetModalOpen(true);
  };

  const openPasswordModal = (u: DevUserRecord) => {
    setPasswordTarget(u);
    setNewPassword(DEMO_PASSWORD);
    setPasswordCopied(false);
    setActionError(null);
  };

  const openRenameModal = (u: DevUserRecord) => {
    setRenameTarget(u);
    setNewUsername(u.username);
    setActionError(null);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 lg:pb-6">
      {/* ═══════════════ Header ═══════════════ */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-11 h-11 bg-amber-50 border border-amber-200 flex items-center justify-center rounded-lg shrink-0">
            <Icon name="terminal" filled className="text-amber-700" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Developer Tools
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Internal panel for demo prep. Only{' '}
              <code className="text-amber-700 font-semibold">administrator</code>{' '}
              accounts can access this page.
            </p>
          </div>
          {lastJobResult && (
            <div
              role="status"
              aria-live="polite"
              className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-2 shrink-0 ${
                lastJobResult.status === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              <Icon
                name={
                  lastJobResult.status === 'success' ? 'check_circle' : 'error'
                }
                size={14}
              />
              Last {lastJobResult.kind}: {lastJobResult.status} ·{' '}
              {formatRelativeTime(lastJobResult.finishedAt)}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ Banners ═══════════════ */}
      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2"
        >
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1 break-words">{actionError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-700 shrink-0"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {actionSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start gap-2"
        >
          <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1 break-words">{actionSuccess}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-500 hover:text-emerald-700 shrink-0"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* ═══════════════ System Status ═══════════════ */}
      <SystemStatusCard />

      {/* ═══════════════ Top grid ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Demo Control ── */}
        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Icon name="rocket_launch" size={20} className="text-[#5c1219]" />
              Demo Control
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Reset and reseed the demo in one step, or run either operation
              independently.
            </p>
          </div>

          {stateLoading ? (
            <div className="h-12 rounded-lg bg-slate-100 animate-pulse" />
          ) : state?.activeTerm ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <Icon
                name="check_circle"
                filled
                size={18}
                className="text-emerald-600 shrink-0"
              />
              <div className="text-xs min-w-0">
                <span className="font-bold text-emerald-900">Active term</span>
                <span className="text-emerald-700 ml-2">
                  {state.activeTerm.termName} · {state.activeTerm.schoolYear}
                  {state.activeTerm.semester &&
                    ` · ${state.activeTerm.semester} sem`}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Icon
                name="warning"
                filled
                size={18}
                className="text-amber-600 shrink-0"
              />
              <div className="text-xs text-amber-800">
                No active term. Seed the demo to create one.
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={openResetModal}
            disabled={isBusy}
            className="hidden sm:flex w-full items-center justify-between gap-3 rounded-xl border-2 border-[#5c1219] bg-gradient-to-r from-[#5c1219] to-[#7a1f28] p-5 text-left text-white hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon name="restart_alt" size={28} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-base font-bold">Reset + Reseed</p>
                <p className="text-[11px] text-white/80 mt-0.5">
                  Fresh demo state in ~45 seconds. Use this before every demo.
                </p>
              </div>
            </div>
            <Icon name="arrow_forward" size={20} className="shrink-0" />
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSeedModalOpen(true)}
              disabled={isBusy}
              className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left hover:bg-emerald-100 transition disabled:opacity-50 min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Icon
                name="add_circle"
                size={20}
                className="text-emerald-700 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-900">Seed only</p>
                <p className="text-[10px] text-emerald-700 mt-0.5 truncate">
                  Add missing rows
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={openResetModal}
              disabled={isBusy}
              className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-left hover:bg-red-100 transition disabled:opacity-50 min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <Icon
                name="delete_sweep"
                size={20}
                className="text-red-700 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-red-900">Reset only</p>
                <p className="text-[10px] text-red-700 mt-0.5 truncate">
                  Wipe demo data
                </p>
              </div>
            </button>
          </div>

          {activeJob && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-lg border p-4 ${
                activeJob.status === 'running'
                  ? 'border-blue-200 bg-blue-50'
                  : activeJob.status === 'success'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {activeJob.status === 'running' ? (
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                ) : activeJob.status === 'success' ? (
                  <Icon
                    name="check_circle"
                    className="text-emerald-600 shrink-0"
                    size={18}
                  />
                ) : (
                  <Icon name="error" className="text-red-600 shrink-0" size={18} />
                )}
                <p className="text-xs font-bold uppercase tracking-wider flex-1">
                  {activeJob.kind} — {activeJob.status}
                  {activeJob.status === 'running' && jobStartedAt && (
                    <span className="text-[10px] font-normal text-blue-700 ml-2 normal-case">
                      ({Math.floor((now - jobStartedAt) / 1000)}s elapsed)
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Dismiss
                </button>
              </div>

              {activeJob.status === 'running' && (
                <div
                  className="mt-2 h-1 w-full bg-blue-100 rounded overflow-hidden"
                  aria-hidden="true"
                >
                  <div className="h-full w-1/3 bg-blue-500 animate-[loading_1.4s_ease-in-out_infinite]" />
                </div>
              )}

              {activeJob.error && (
                <p className="text-xs text-red-700 mt-2 font-mono break-all">
                  {activeJob.error}
                </p>
              )}
              {activeJob.output && (
                <pre className="text-[10px] font-mono text-slate-700 mt-2 max-h-48 overflow-y-auto bg-white/60 rounded p-2 whitespace-pre-wrap break-all">
                  {activeJob.output}
                </pre>
              )}
            </div>
          )}
        </section>

        {/* ── Live Status ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Icon name="monitoring" size={16} className="text-[#5c1219]" />
              Live Status
            </h2>
            <span
              className="inline-flex items-center gap-1 text-[10px] text-slate-400"
              title="Auto-refreshes every 8s"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              live
            </span>
          </div>

          <div className="space-y-1.5">
            {stateLoading
              ? STATUS_ROWS.map(({ key }) => (
                  <div
                    key={key}
                    className="h-6 rounded bg-slate-100 animate-pulse"
                  />
                ))
              : STATUS_ROWS.map(({ key, label, icon }) => {
                  const count = state?.counts?.[key] ?? 0;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 py-1 text-xs border-b border-slate-100 last:border-0"
                    >
                      <Icon
                        name={icon}
                        size={14}
                        className="text-slate-400 shrink-0"
                      />
                      <span className="text-slate-600 flex-1">{label}</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {count < 0 ? '—' : count}
                      </span>
                    </div>
                  );
                })}
            <div className="flex items-center gap-2 py-1 text-xs">
              <Icon
                name="wifi"
                size={14}
                className={isConnected ? 'text-emerald-500' : 'text-slate-400'}
              />
              <span className="text-slate-600 flex-1">Online users</span>
              <span className="font-bold text-slate-900 tabular-nums">
                {isConnected ? onlineUsers.length : '—'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => refetchState()}
            className="w-full text-xs text-slate-500 hover:text-slate-900 flex items-center justify-center gap-1 py-2 rounded border border-slate-200 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]"
          >
            <Icon name="refresh" size={12} />
            Refresh now
          </button>
        </section>
      </div>

      {/* ═══════════════ Users ═══════════════ */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Icon name="group" size={16} className="text-[#5c1219]" />
            Users ({filteredUsers.length}
            {searchQuery && ` of ${users.length}`})
          </h2>
          <div className="flex-1" />
          <div className="relative w-full sm:w-64">
            <label htmlFor="user-search" className="sr-only">
              Search users
            </label>
            <Icon
              name="search"
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              id="user-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search username, email, role…"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
            />
          </div>
          <button
            type="button"
            onClick={() => refetchUsers()}
            className="text-xs text-slate-500 hover:text-slate-900 flex items-center justify-center gap-1 px-3 py-2 rounded border border-slate-200 min-h-[40px] shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]"
          >
            <Icon name="refresh" size={12} />
            <span className="sm:hidden">Refresh</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {usersLoading ? (
          <div className="divide-y divide-slate-100">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
                  <div className="h-2.5 w-48 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
            <Icon name="search_off" size={32} className="text-slate-300" />
            {searchQuery ? 'No users match your search.' : 'No users found.'}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-[#5c1219] hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((u) => {
              const roleMeta = ROLE_TONE[u.role] ?? ROLE_TONE.viewer;
              const isOnline = onlineUserIds.has(u.userId);
              const presenceLabel = isOnline
                ? 'Online'
                : isConnected
                  ? 'Offline'
                  : '—';
              const isSelf = currentUser?.id === u.userId;
              return (
                <div
                  key={u.userId}
                  className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                      {isOnline && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
                          aria-label="Online"
                          title="Online"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {u.username}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border rounded ${roleMeta.className}`}
                        >
                          {roleMeta.label}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                            isOnline ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                          aria-label={`Presence: ${presenceLabel}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                          {presenceLabel}
                        </span>
                        {!u.isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">
                            inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {u.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 sm:justify-end flex-wrap">
                    <button
                      type="button"
                      onClick={() => openPasswordModal(u)}
                      className="flex-1 sm:flex-initial text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-white hover:border-[#5c1219] hover:text-[#5c1219] transition flex items-center justify-center gap-1.5 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]"
                    >
                      <Icon name="password" size={14} />
                      Password
                    </button>
                    <button
                      type="button"
                      onClick={() => openRenameModal(u)}
                      className="flex-1 sm:flex-initial text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-white hover:border-[#5c1219] hover:text-[#5c1219] transition flex items-center justify-center gap-1.5 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]"
                    >
                      <Icon name="edit" size={14} />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        u.isActive
                          ? setDeactivateTarget(u)
                          : toggleActiveMutation.mutate(u.userId)
                      }
                      disabled={toggleActiveMutation.isPending || isSelf}
                      title={isSelf ? 'You cannot deactivate your own account' : undefined}
                      className={`flex-1 sm:flex-initial text-xs px-3 py-2 rounded-lg border transition flex items-center justify-center gap-1.5 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219] disabled:opacity-50 disabled:cursor-not-allowed ${
                        u.isActive
                          ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Icon
                        name={u.isActive ? 'toggle_off' : 'toggle_on'}
                        size={14}
                      />
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══════════════ Mobile sticky action bar ═══════════════ */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <button
          type="button"
          onClick={openResetModal}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5c1219] to-[#7a1f28] py-3 text-white font-bold text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <Icon name="restart_alt" size={20} />
          Reset + Reseed
        </button>
      </div>

      {/* ═══════════════ Seed modal ═══════════════ */}
      <Modal
        open={seedModalOpen}
        onClose={() => setSeedModalOpen(false)}
        title="Seed demo data"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This adds any missing rows from the demo seed. It{' '}
            <strong className="text-slate-900">does not</strong> delete existing
            data — safe to run repeatedly.
          </p>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2 font-mono break-all">
            pnpm --filter @coe-nnect/backend seed:demo
          </p>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSeedModalOpen(false)}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="px-5 py-2.5 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition rounded-lg disabled:opacity-50"
            >
              {seedMutation.isPending ? 'Seeding…' : 'Seed'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ Reset modal ═══════════════ */}
      <Modal
        open={resetModalOpen}
        onClose={() => {
          setResetModalOpen(false);
          setResetPhrase('');
        }}
        title="Confirm demo data reset"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded">
            <p className="font-bold mb-1">This will delete:</p>
            <ul className="text-xs list-disc pl-5 space-y-0.5">
              <li>Schedules, versions, unscheduled entries</li>
              <li>Chat conversations and messages</li>
              <li>Faculty requests and notifications</li>
              <li>Faculty, subjects, sections, prospectus</li>
              <li>Terms and audit trail</li>
            </ul>
            <p className="mt-2 text-xs">
              Departments, programs, rooms, settings, and{' '}
              <strong>user accounts</strong> are kept.
            </p>
          </div>

          <div>
            <label
              htmlFor="reset-confirm"
              className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
            >
              Type{' '}
              <code className="text-red-700 select-all">
                {RESET_CONFIRM_PHRASE}
              </code>{' '}
              to confirm
            </label>
            <input
              id="reset-confirm"
              type="text"
              value={resetPhrase}
              onChange={(e) => setResetPhrase(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/10 font-mono"
              placeholder={RESET_CONFIRM_PHRASE}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setResetModalOpen(false);
                setResetPhrase('');
              }}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                resetPhrase !== RESET_CONFIRM_PHRASE || resetMutation.isPending
              }
              onClick={() => resetMutation.mutate()}
              className="px-5 py-2.5 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resetMutation.isPending ? 'Resetting…' : 'Reset demo data'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ Password modal ═══════════════ */}
      <Modal
        open={!!passwordTarget}
        onClose={() => {
          setPasswordTarget(null);
          setNewPassword('');
          setPasswordCopied(false);
        }}
        title={
          passwordTarget
            ? `Set password for ${passwordTarget.username}`
            : 'Set password'
        }
        size="md"
      >
        <div className="space-y-4">
          {passwordTarget && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                {passwordTarget.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">
                  {passwordTarget.username}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {passwordTarget.email}
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            The user will <strong>not</strong> be notified. Their existing
            sessions stay valid until they expire.
          </p>

          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
            >
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type="text"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordCopied(false);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 pr-24 text-sm font-mono focus:outline-none focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleCopyPassword}
                aria-label={passwordCopied ? 'Password copied' : 'Copy password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:text-[#5c1219] hover:border-[#5c1219] transition flex items-center gap-1"
              >
                <Icon
                  name={passwordCopied ? 'check' : 'content_copy'}
                  size={12}
                />
                {passwordCopied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              {[
                ['length', '8+ chars'],
                ['upper', 'Uppercase'],
                ['lower', 'Lowercase'],
                ['digit', 'Number'],
                ['symbol', 'Symbol'],
              ].map(([key, label]) => {
                const ok = (pwChecks as any)[key];
                return (
                  <li
                    key={key}
                    className={`flex items-center gap-1 ${
                      ok ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    <Icon
                      name={ok ? 'check_circle' : 'radio_button_unchecked'}
                      size={10}
                    />
                    {label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setPasswordTarget(null);
                setNewPassword('');
                setPasswordCopied(false);
              }}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!pwValid || passwordMutation.isPending}
              onClick={() => {
                if (passwordTarget) {
                  passwordMutation.mutate({
                    userId: passwordTarget.userId,
                    pw: newPassword,
                  });
                }
              }}
              className="px-5 py-2.5 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {passwordMutation.isPending ? 'Updating…' : 'Set password'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ Rename modal ═══════════════ */}
      <Modal
        open={!!renameTarget}
        onClose={() => {
          setRenameTarget(null);
          setNewUsername('');
        }}
        title={renameTarget ? `Rename ${renameTarget.username}` : 'Rename user'}
        size="md"
      >
        <div className="space-y-4">
          {renameTarget && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <p className="text-slate-500">Current</p>
              <p className="font-mono font-bold text-slate-900 break-all">
                {renameTarget.username}
              </p>
              <p className="text-slate-500 mt-2">Email (unchanged)</p>
              <p className="font-mono text-slate-700 break-all">
                {renameTarget.email}
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="new-username"
              className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
            >
              New username
            </label>
            <input
              id="new-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className={`w-full bg-slate-50 border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
                newUsername && !USERNAME_RE.test(newUsername)
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
                  : 'border-slate-200 focus:border-[#5c1219] focus:ring-[#5c1219]/10'
              }`}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!newUsername && !USERNAME_RE.test(newUsername)}
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Letters, numbers, dots, underscores, and hyphens only.
            </p>
            {newUsername && !USERNAME_RE.test(newUsername) && (
              <p className="text-[10px] text-red-600 mt-1">
                Invalid characters in username.
              </p>
            )}
            {newUsername &&
              USERNAME_RE.test(newUsername) &&
              newUsername === renameTarget?.username && (
                <p className="text-[10px] text-amber-600 mt-1">
                  This is the current username.
                </p>
              )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setRenameTarget(null);
                setNewUsername('');
              }}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!renameValid || renameMutation.isPending}
              onClick={() => {
                if (renameTarget) {
                  renameMutation.mutate({
                    userId: renameTarget.userId,
                    name: newUsername,
                  });
                }
              }}
              className="px-5 py-2.5 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {renameMutation.isPending ? 'Renaming…' : 'Rename'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════════════ Deactivate Confirmation ═══════════════ */}
      <Modal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate user?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded flex items-start gap-2">
            <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {deactivateTarget?.username} will be immediately locked out.
              </p>
              <p className="text-xs mt-1">
                They will be banned in Supabase Auth and will no longer be able
                to log in until reactivated.
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeactivateTarget(null)}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={toggleActiveMutation.isPending}
              onClick={() => {
                if (deactivateTarget) {
                  toggleActiveMutation.mutate(deactivateTarget.userId);
                }
              }}
              className="px-5 py-2.5 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition rounded-lg disabled:opacity-50"
            >
              {toggleActiveMutation.isPending ? 'Deactivating…' : 'Deactivate'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// System Status card — write path for the login-page banner
// ─────────────────────────────────────────────────────────────
function SystemStatusCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: fetchSystemStatusForDev,
  });

  const [enabled, setEnabled] = useState(false);
  const [severity, setSeverity] =
    useState<SystemStatusSeverity>('warning');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  // Hydrate from server on first load / refetch
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setSeverity(data.severity);
    setTitle(data.title ?? '');
    setMessage(data.message ?? '');
  }, [data?.updatedAt]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateSystemStatus({
        enabled,
        severity,
        title: title.trim(),
        message: message.trim() || null,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['system-status'], next);
      queryClient.invalidateQueries({ queryKey: ['dev-tools'] });
      setSaved(
        enabled
          ? 'Banner updated — visible on login page.'
          : 'Banner hidden.',
      );
    },
    onError: (err: any) => {
      alert(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to save system status.',
      );
    },
  });

  const SEVERITY_OPTIONS: Array<{
    value: SystemStatusSeverity;
    label: string;
    dot: string;
  }> = [
    { value: 'info', label: 'Info', dot: 'bg-blue-500' },
    { value: 'warning', label: 'Warning', dot: 'bg-amber-500' },
    { value: 'critical', label: 'Critical', dot: 'bg-red-500' },
    { value: 'maintenance', label: 'Maintenance', dot: 'bg-violet-500' },
  ];

  const titleMissing = enabled && title.trim().length === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Icon name="campaign" size={20} className="text-[#5c1219]" />
            System Status Banner
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-lg">
            Shown on the login page for everyone. Use it to warn about
            downtime, maintenance, or a reset in progress.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-[#5c1219]"
            disabled={isLoading}
          />
          {enabled ? 'Visible' : 'Hidden'}
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SEVERITY_OPTIONS.map((opt) => {
          const active = severity === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSeverity(opt.value)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                active
                  ? 'border-[#5c1219] bg-[#5c1219]/5 text-[#5c1219]'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div>
        <label
          htmlFor="ss-title"
          className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
        >
          Title {titleMissing && <span className="text-red-600">*</span>}
        </label>
        <input
          id="ss-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="e.g. Scheduling solver is temporarily unavailable"
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10"
          disabled={isLoading}
        />
        <p className="text-[10px] text-slate-400 mt-1 text-right tabular-nums">
          {title.length}/120
        </p>
      </div>

      <div>
        <label
          htmlFor="ss-message"
          className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
        >
          Message <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          id="ss-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Explain what's happening and when it will be back. Line breaks are preserved."
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#5c1219] focus:ring-2 focus:ring-[#5c1219]/10 resize-y min-h-[72px]"
          disabled={isLoading}
        />
        <p className="text-[10px] text-slate-400 mt-1 text-right tabular-nums">
          {message.length}/2000
        </p>
      </div>

      {/* Live preview */}
      {(title.trim() || message.trim()) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Status popup preview
          </p>
          <SystemStatusBannerPreview
            severity={severity}
            title={title}
            message={message}
            enabled={enabled}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <div className="text-[11px] text-slate-500">
          {data && (
            <>
              Last updated{' '}
              {new Date(data.updatedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={titleMissing || saveMutation.isPending || isLoading}
          title={titleMissing ? 'Add a title first' : undefined}
          className="px-4 py-2 text-sm font-semibold bg-[#5c1219] text-white rounded-lg hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {saveMutation.isPending ? (
            <>
              <Icon
                name="progress_activity"
                size={14}
                className="animate-spin"
              />
              Saving…
            </>
          ) : (
            <>
              <Icon name="save" size={14} />
              Save banner
            </>
          )}
        </button>
      </div>

      {saved && (
        <div
          role="status"
          aria-live="polite"
          className="text-xs px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5"
        >
          <Icon name="check_circle" size={14} />
          {saved}
        </div>
      )}
    </section>
  );
}

/**
 * Local mirror of the system status popup styling.
 * Intentionally duplicated so Dev Tools doesn't depend on the auth feature
 * folder (different bundle chunk).
 */
function SystemStatusBannerPreview({
  severity,
  title,
  message,
  enabled,
}: {
  severity: SystemStatusSeverity;
  title: string;
  message: string;
  enabled: boolean;
}) {
  const THEME: Record<
    SystemStatusSeverity,
    { panel: string; accent: string; icon: string; iconName: string; pill: string }
  > = {
    info: {
      panel: 'border-blue-200',
      accent: 'bg-blue-500',
      icon: 'bg-blue-100 text-blue-700',
      iconName: 'info',
      pill: 'bg-blue-100 text-blue-700',
    },
    warning: {
      panel: 'border-amber-200',
      accent: 'bg-amber-500',
      icon: 'bg-amber-100 text-amber-700',
      iconName: 'warning',
      pill: 'bg-amber-100 text-amber-700',
    },
    critical: {
      panel: 'border-red-200',
      accent: 'bg-red-500',
      icon: 'bg-red-100 text-red-700',
      iconName: 'error',
      pill: 'bg-red-100 text-red-700',
    },
    maintenance: {
      panel: 'border-violet-200',
      accent: 'bg-violet-500',
      icon: 'bg-violet-100 text-violet-700',
      iconName: 'build',
      pill: 'bg-violet-100 text-violet-700',
    },
  };
  const t = THEME[severity];

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white shadow-lg ${t.panel} ${
        enabled ? '' : 'opacity-50'
      }`}
    >
      <div className={`h-1.5 w-full ${t.accent}`} aria-hidden="true" />

      <div className="p-4">
        <div className="flex items-start gap-2.5">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.icon}`}
          >
            <Icon name={t.iconName} filled size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${t.pill}`}
            >
              {severity}
            </span>
            <p className="mt-1 text-sm font-bold leading-snug text-slate-900">
              {title || 'Title preview'}
            </p>
          </div>
        </div>

        {message && (
          <p className="mt-2.5 whitespace-pre-line text-xs leading-relaxed text-slate-700">
            {message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <p className="text-[11px] text-slate-500">
          Please read the notice before closing.
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500">
          <Icon name="schedule" size={16} className="animate-pulse" />
          <span className="tabular-nums">3s</span>
        </span>
      </div>

      {!enabled && (
        <p className="border-t border-slate-200 px-4 py-2 text-[10px] italic text-slate-500">
          Hidden — this is what it would look like if enabled.
        </p>
      )}
    </div>
  );
}