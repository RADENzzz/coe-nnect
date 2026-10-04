import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../api/departments.api'; // Ensure path points to your api folder
import { fetchUsers } from '../../api/users.api';             // Ensure path points to your api folder
import { useAuthStore } from '../../store/auth.store';

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);

  // Fetch departments using your API client
  const { data: departments = [], isLoading: loadingDepts } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  // Fetch users using your API client
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: !!user,
  });

  const isLoading = loadingDepts || loadingUsers;

  // Calculate live stats directly from state
  const totalDepartments = departments.length;
  const totalUsers = users.length;
  const activeAccounts = users.filter((u) => u.isActive).length;

  const cards = [
    { label: 'Total Departments', icon: 'domain', value: totalDepartments },
    { label: 'Total Users', icon: 'manage_accounts', value: totalUsers },
    { label: 'Active Accounts', icon: 'verified_user', value: activeAccounts },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage departments and user accounts for CoE-NNECT.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 p-5 flex items-center gap-4 shadow-sm"
          >
            <div className="w-9 h-9 bg-red-50 border border-red-200 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#5c1219] text-lg">{card.icon}</span>
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

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <a
          href="/admin/departments"
          className="bg-white border border-slate-200 hover:border-slate-300 p-5 flex items-center gap-4 transition-all group shadow-sm"
        >
          <span className="material-symbols-outlined text-2xl text-[#5c1219]">domain</span>
          <div>
            <p className="font-semibold text-sm text-slate-900">Manage Departments</p>
            <p className="text-sm text-slate-500 mt-0.5">Create and view all departments</p>
          </div>
          <span className="material-symbols-outlined text-slate-400 ml-auto text-lg group-hover:translate-x-0.5 transition-transform">
            arrow_forward
          </span>
        </a>

        <a
          href="/admin/users"
          className="bg-white border border-slate-200 hover:border-slate-300 p-5 flex items-center gap-4 transition-all group shadow-sm"
        >
          <span className="material-symbols-outlined text-2xl text-[#5c1219]">manage_accounts</span>
          <div>
            <p className="font-semibold text-sm text-slate-900">Manage Users</p>
            <p className="text-sm text-slate-500 mt-0.5">Create department head accounts</p>
          </div>
          <span className="material-symbols-outlined text-slate-400 ml-auto text-lg group-hover:translate-x-0.5 transition-transform">
            arrow_forward
          </span>
        </a>
      </div>
    </div>
  );
}