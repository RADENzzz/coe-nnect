import { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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
  type DevJob,
  type DevUserRecord,
} from '../../api/dev-tools.api';

const DEMO_PASSWORD = 'Demo!2345';
const RESET_CONFIRM_PHRASE = 'RESET DEMO DATA';

// ── Role tone mapping for badges ──
const ROLE_TONE: Record<
  string,
  { label: string; className: string }
> = {
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

export default function DevToolsPage() {
  // ── Queries ──
  const { data: state, refetch: refetchState } = useQuery({
    queryKey: ['dev-tools', 'state'],
    queryFn: fetchSystemState,
    refetchInterval: 8_000,
  });

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ['dev-tools', 'users'],
    queryFn: listDevUsers,
  });

  // ── UI state ──
  const [activeJob, setActiveJob] = useState<DevJob | null>(null);
  const [lastJobResult, setLastJobResult] = useState<{
    kind: 'seed' | 'reset';
    status: 'success' | 'failed';
    finishedAt: number;
  } | null>(null);

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

  // ── Filtered user list ──
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

  // ── Job polling ──
  const startPolling = (jobId: string, kind: 'seed' | 'reset') => {
    const poll = async () => {
      const job = await fetchJob(jobId);
      if (!job) return;
      setActiveJob(job);
      if (job.status === 'running') {
        setTimeout(poll, 1500);
      } else {
        setLastJobResult({
          kind,
          status: job.status,
          finishedAt: Date.now(),
        });
        refetchState();
        refetchUsers();
      }
    };
    poll();
  };

  // ── Mutations ──
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
      setActionSuccess(
        `Password updated for "${target?.username ?? 'user'}".`,
      );
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

  const isBusy =
    activeJob?.status === 'running' ||
    seedMutation.isPending ||
    resetMutation.isPending;

  // ── Copy password to clipboard ──
  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(newPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch {
      // clipboard may be blocked — silent fail
    }
  };

  // ── Format relative time ──
  const formatRelativeTime = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ═══════════════ Header ═══════════════ */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-11 h-11 bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Icon name="terminal" filled className="text-amber-700" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
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
              className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-2 ${
                lastJobResult.status === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              <Icon
                name={
                  lastJobResult.status === 'success'
                    ? 'check_circle'
                    : 'error'
                }
                size={14}
              />
              Last {lastJobResult.kind}: {lastJobResult.status} ·{' '}
              {formatRelativeTime(lastJobResult.finishedAt)}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ Global banners ═══════════════ */}
      {actionError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {/* ═══════════════ Top grid: Demo Control + Live Status ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Demo Control (hero) ── */}
        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
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

          {state?.activeTerm ? (
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
                  {state.activeTerm.semester && ` · ${state.activeTerm.semester} sem`}
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

          {/* Primary action */}
          <button
            onClick={() => {
              setResetPhrase('');
              setResetModalOpen(true);
            }}
            disabled={isBusy}
            className="w-full flex items-center justify-between gap-3 rounded-xl border-2 border-[#5c1219] bg-gradient-to-r from-[#5c1219] to-[#7a1f28] p-5 text-left text-white hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Secondary actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSeedModalOpen(true)}
              disabled={isBusy}
              className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left hover:bg-emerald-100 transition disabled:opacity-50"
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
              onClick={() => {
                setResetPhrase('');
                setResetModalOpen(true);
              }}
              disabled={isBusy}
              className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-left hover:bg-red-100 transition disabled:opacity-50"
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

          {/* Job progress */}
          {activeJob && (
            <div
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
                  <Icon
                    name="error"
                    className="text-red-600 shrink-0"
                    size={18}
                  />
                )}
                <p className="text-xs font-bold uppercase tracking-wider flex-1">
                  {activeJob.kind} — {activeJob.status}
                </p>
                <button
                  onClick={() => setActiveJob(null)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Dismiss
                </button>
              </div>
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
            {[
              { key: 'schedules', label: 'Schedules', icon: 'calendar_view_month' },
              { key: 'faculty', label: 'Faculty', icon: 'groups' },
              { key: 'subjects', label: 'Subjects', icon: 'menu_book' },
              { key: 'sections', label: 'Sections', icon: 'view_module' },
              { key: 'prospectus', label: 'Prospectus', icon: 'library_books' },
              { key: 'users', label: 'Users', icon: 'manage_accounts' },
              { key: 'department', label: 'Departments', icon: 'corporate_fare' },
              { key: 'notification', label: 'Notifications', icon: 'notifications' },
            ].map(({ key, label, icon }) => {
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
          </div>

          <button
            onClick={() => refetchState()}
            className="w-full text-xs text-slate-500 hover:text-slate-900 flex items-center justify-center gap-1 py-1.5 rounded border border-slate-200"
          >
            <Icon name="refresh" size={12} />
            Refresh now
          </button>
        </section>
      </div>

      {/* ═══════════════ Users ═══════════════ */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Icon name="group" size={16} className="text-[#5c1219]" />
            Users ({filteredUsers.length}
            {searchQuery && ` of ${users.length}`})
          </h2>
          <div className="flex-1" />
          <div className="relative w-full sm:w-64">
            <Icon
              name="search"
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search username, email, role…"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#5c1219]"
            />
          </div>
          <button
            onClick={() => refetchUsers()}
            className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 px-3 py-1.5 rounded border border-slate-200"
          >
            <Icon name="refresh" size={12} />
            Refresh
          </button>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            {searchQuery
              ? 'No users match your search.'
              : 'No users found.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((u) => {
              const roleMeta = ROLE_TONE[u.role] ?? ROLE_TONE.viewer;
              return (
                <div
                  key={u.userId}
                  className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                    {u.username.slice(0, 2).toUpperCase()}
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
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setPasswordTarget(u);
                        setNewPassword(DEMO_PASSWORD);
                        setPasswordCopied(false);
                        setActionError(null);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-white hover:border-[#5c1219] hover:text-[#5c1219] transition flex items-center gap-1.5"
                    >
                      <Icon name="password" size={14} />
                      Password
                    </button>
                    <button
                      onClick={() => {
                        setRenameTarget(u);
                        setNewUsername(u.username);
                        setActionError(null);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-white hover:border-[#5c1219] hover:text-[#5c1219] transition flex items-center gap-1.5"
                    >
                      <Icon name="edit" size={14} />
                      Rename
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
            <strong className="text-slate-900">does not</strong> delete
            existing data — safe to run repeatedly.
          </p>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2 font-mono">
            pnpm --filter @coe-nnect/backend seed:demo
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setSeedModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => seedMutation.mutate()}
              className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition rounded-lg"
            >
              Seed
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
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              Type{' '}
              <code className="text-red-700 select-all">
                {RESET_CONFIRM_PHRASE}
              </code>{' '}
              to confirm
            </label>
            <input
              type="text"
              value={resetPhrase}
              onChange={(e) => setResetPhrase(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
              placeholder={RESET_CONFIRM_PHRASE}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setResetModalOpen(false);
                setResetPhrase('');
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              disabled={
                resetPhrase !== RESET_CONFIRM_PHRASE ||
                resetMutation.isPending
              }
              onClick={() => resetMutation.mutate()}
              className="px-5 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
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
          {/* Target preview — impossible to lose track of who */}
          {passwordTarget && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                {passwordTarget.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
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
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              New password
            </label>
            <div className="relative">
              <input
                type="text"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordCopied(false);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-24 text-sm font-mono focus:outline-none focus:border-[#5c1219]"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCopyPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:text-[#5c1219] hover:border-[#5c1219] transition flex items-center gap-1"
              >
                <Icon
                  name={passwordCopied ? 'check' : 'content_copy'}
                  size={12}
                />
                {passwordCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Min 8 chars · upper · lower · digit · symbol
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setPasswordTarget(null);
                setNewPassword('');
                setPasswordCopied(false);
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              disabled={
                !newPassword ||
                newPassword.length < 8 ||
                passwordMutation.isPending
              }
              onClick={() => {
                if (passwordTarget) {
                  passwordMutation.mutate({
                    userId: passwordTarget.userId,
                    pw: newPassword,
                  });
                }
              }}
              className="px-5 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
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
        title={
          renameTarget ? `Rename ${renameTarget.username}` : 'Rename user'
        }
        size="md"
      >
        <div className="space-y-4">
          {renameTarget && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <p className="text-slate-500">Current</p>
              <p className="font-mono font-bold text-slate-900">
                {renameTarget.username}
              </p>
              <p className="text-slate-500 mt-2">Email (unchanged)</p>
              <p className="font-mono text-slate-700">{renameTarget.email}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
              New username
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#5c1219]"
              autoFocus
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Letters, numbers, dots, underscores, and hyphens only.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setRenameTarget(null);
                setNewUsername('');
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              disabled={
                !newUsername ||
                newUsername === renameTarget?.username ||
                renameMutation.isPending
              }
              onClick={() => {
                if (renameTarget) {
                  renameMutation.mutate({
                    userId: renameTarget.userId,
                    name: newUsername,
                  });
                }
              }}
              className="px-5 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {renameMutation.isPending ? 'Renaming…' : 'Rename'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}