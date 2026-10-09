import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../api/departments.api';
import { fetchSchedules, fetchActiveTerm } from '../../api/schedule.api';
import { fetchUserDirectory } from '../../api/users.api';
import Icon from '../../components/ui/Icon';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';

function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'brand',
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color?: 'brand' | 'green' | 'amber' | 'blue';
}) {
  const colors = {
    brand: 'bg-red-50 border-red-200 text-[#5c1219]',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
  };
  return (
    <div className="bg-white border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
      <div
        className={`w-9 h-9 border flex items-center justify-center ${colors[color]}`}
      >
        <Icon name={icon} filled size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
          {value}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

export default function DeanDashboardPage() {
  const profile = useAuthStore((s) => s.profile);

  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: directory = [] } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: fetchUserDirectory,
  });

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const { onlineUsers, isConnected } = useOnlineUsers();

  const activeDepts = departments.filter((d) => d.isActive);
  const reviewSchedules = schedules.filter((s) => s.status === 'review');
  const finalizedSchedules = schedules.filter(
    (s) => s.status === 'finalized' || s.status === 'published',
  );

  // Directory is a minimal projection: user_id, username, role, dept_id, is_active
  const deptHeads = directory.filter(
    (u) => u.role === 'department_head' && u.is_active,
  );

  const onlineUserIds = new Set(onlineUsers.map((u) => u.user_id));

  const deptsWithHeads = activeDepts.map((dept) => {
    const head = deptHeads.find(
      (u) => String(u.dept_id) === String(dept.deptId),
    );
    return {
      dept,
      head,
      isOnline: head ? onlineUserIds.has(head.user_id) : false,
    };
  });

  const onlineDHs = deptsWithHeads.filter((x) => x.isOnline).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Dean's Overview
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {activeTerm
            ? `Active term: ${activeTerm.termName} — ${activeTerm.schoolYear}`
            : 'No active term currently set.'}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="corporate_fare"
          label="Active Departments"
          value={deptLoading ? '—' : activeDepts.length}
          sub={`${departments.length} total`}
          color="brand"
        />
        <StatCard
          icon="pending_actions"
          label="Pending Approvals"
          value={reviewSchedules.length}
          sub="Schedules in review"
          color={reviewSchedules.length > 0 ? 'amber' : 'green'}
        />
        <StatCard
          icon="check_circle"
          label="Finalized Schedules"
          value={finalizedSchedules.length}
          sub={activeTerm ? `For ${activeTerm.termName}` : '—'}
          color="green"
        />
        <StatCard
          icon="sensors"
          label="Dept. Heads Online"
          value={`${onlineDHs} / ${deptsWithHeads.filter((x) => x.head).length}`}
          sub={isConnected ? 'Live' : 'Connecting…'}
          color={onlineDHs > 0 ? 'green' : 'blue'}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Departments list */}
        <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
              Departments
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{activeDepts.length} active</span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                {onlineDHs} online
              </span>
            </div>
          </div>
          {deptLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#5c1219] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeDepts.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No departments found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {deptsWithHeads.map(({ dept, head, isOnline }) => (
                <div
                  key={dept.deptId}
                  className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                        isOnline
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-slate-300'
                      }`}
                      title={isOnline ? 'Online' : 'Offline'}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {dept.deptName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {dept.deptCode}
                        {head
                          ? ` · Head: ${head.username}`
                          : ' · No head assigned'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 border shrink-0 ${
                      isOnline
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Approvals */}
        <div className="bg-white border border-slate-200 shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
              Pending Approvals
            </h2>
            {reviewSchedules.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">
                {reviewSchedules.length} pending
              </span>
            )}
          </div>
          {reviewSchedules.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center px-5">
              <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
                <Icon name="check_circle" filled className="text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                All caught up
              </p>
              <p className="text-xs text-slate-400 mt-1">
                No schedules pending review.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-80">
              {reviewSchedules.slice(0, 10).map((s) => (
                <div
                  key={s.scheduleId}
                  className="px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {s.subject?.subjectCode ?? 'Unknown Subject'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {s.faculty
                      ? `${s.faculty.firstName} ${s.faculty.lastName}`
                      : 'No faculty'}{' '}
                    · {s.timeSlot?.dayOfWeek ?? s.dayOfWeek ?? '—'}{' '}
                    {s.timeSlot?.startTime ?? s.startTime ?? ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Department Heads Online */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
              }`}
            />
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
              Department Heads Online
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            {onlineDHs} of {deptHeads.length} online
          </span>
        </div>

        {deptHeads.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No department heads configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 divide-slate-100">
            {deptHeads.map((head) => {
              const isOnline = onlineUserIds.has(head.user_id);
              const dept = departments.find(
                (d) => String(d.deptId) === String(head.dept_id),
              );
              return (
                <div
                  key={head.user_id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">
                      {initials(head.username)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${
                        isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {head.username}
                      {head.user_id === profile?.user_id && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {dept
                        ? `[${dept.deptCode}] ${dept.deptName}`
                        : 'No department'}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 shrink-0 ${
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
    </div>
  );
}