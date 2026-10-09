import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../api/departments.api';
import { fetchUsers } from '../../api/users.api';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  college_dean: 'College Dean',
  department_head: 'Department Head',
  viewer: 'Viewer',
};

const ROLE_TONES: Record<string, string> = {
  administrator: 'bg-red-50 text-red-800 border-red-200',
  college_dean: 'bg-blue-50 text-blue-800 border-blue-200',
  department_head: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  viewer: 'bg-slate-50 text-slate-600 border-slate-200',
};

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const { data: departments = [], isLoading: loadingDepts } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: !!user,
  });

  const { onlineUsers, isConnected, count: onlineCount } = useOnlineUsers();

  const isLoading = loadingDepts || loadingUsers;

  const totalDepartments = departments.length;
  const totalUsers = users.length;
  const activeAccounts = users.filter((u) => u.isActive).length;

  const cards = [
    { label: 'Total Departments', icon: 'domain', value: totalDepartments },
    { label: 'Total Users', icon: 'manage_accounts', value: totalUsers },
    { label: 'Active Accounts', icon: 'verified_user', value: activeAccounts },
    { label: 'Users Online', icon: 'sensors', value: onlineCount },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Admin Dashboard
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage departments and user accounts for CoE-NNECT.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 p-5 flex items-center gap-4 shadow-sm"
          >
            <div className="w-9 h-9 bg-red-50 border border-red-200 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#5c1219] text-lg">
                {card.icon}
              </span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {isLoading ? '—' : card.value}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Online Users Panel */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-slate-300'
              }`}
            />
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Users Online
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {isConnected ? `${onlineCount} connected` : 'Connecting…'}
          </span>
        </div>

        {onlineUsers.length === 0 ? (
          <div className="py-12 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-300">
              group_off
            </span>
            <p className="text-sm text-slate-500 mt-2">
              {isConnected ? 'No users online right now.' : 'Connecting to presence…'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {onlineUsers.map((u) => {
              const isSelf = u.user_id === profile?.user_id;
              const roleLabel = ROLE_LABELS[u.role] ?? u.role;
              const roleTone = ROLE_TONES[u.role] ?? ROLE_TONES.viewer;
              return (
                <div
                  key={u.user_id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 bg-[#5c1219] text-white text-xs font-bold flex items-center justify-center">
                      {initials(u.username)}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {u.username}
                      {isSelf && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {u.dept_name
                        ? `[${u.dept_code ?? '—'}] ${u.dept_name}`
                        : 'No department'}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 shrink-0 ${roleTone}`}
                  >
                    {roleLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <a
          href="/admin/departments"
          className="bg-white border border-slate-200 hover:border-slate-300 p-5 flex items-center gap-4 transition-all group shadow-sm"
        >
          <span className="material-symbols-outlined text-2xl text-[#5c1219]">
            domain
          </span>
          <div>
            <p className="font-semibold text-sm text-slate-900">
              Manage Departments
            </p>
            <p className="text-sm text-slate-500 mt-0.5">
              Create and view all departments
            </p>
          </div>
          <span className="material-symbols-outlined text-slate-400 ml-auto text-lg group-hover:translate-x-0.5 transition-transform">
            arrow_forward
          </span>
        </a>

        <a
          href="/admin/users"
          className="bg-white border border-slate-200 hover:border-slate-300 p-5 flex items-center gap-4 transition-all group shadow-sm"
        >
          <span className="material-symbols-outlined text-2xl text-[#5c1219]">
            manage_accounts
          </span>
          <div>
            <p className="font-semibold text-sm text-slate-900">Manage Users</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Create department head accounts
            </p>
          </div>
          <span className="material-symbols-outlined text-slate-400 ml-auto text-lg group-hover:translate-x-0.5 transition-transform">
            arrow_forward
          </span>
        </a>
      </div>
    </div>
  );
}