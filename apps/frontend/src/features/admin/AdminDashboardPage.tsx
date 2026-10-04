import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase'; // Adjust path to where your supabase.ts is placed

interface StatsState {
  departments: number | string;
  users: number | string;
  activeAccounts: number | string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsState>({
    departments: '—',
    users: '—',
    activeAccounts: '—',
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchDashboardStats() {
      try {
        setLoading(true);

        // 1. Fetch Total Departments Count
        const { count: deptCount, error: deptError } = await supabase
          .from('departments') // Adjust table name if different (e.g., 'department')
          .select('*', { count: 'exact', head: true });

        // 2. Fetch Total Users Count
        const { count: userCount, error: userError } = await supabase
          .from('users') // Adjust table name if using 'profiles' or 'accounts'
          .select('*', { count: 'exact', head: true });

        // 3. Fetch Active Accounts Count
        const { count: activeCount, error: activeError } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'); // Adjust column name/value (e.g., is_active: true)

        if (deptError) console.error('Error fetching departments:', deptError);
        if (userError) console.error('Error fetching users:', userError);
        if (activeError) console.error('Error fetching active users:', activeError);

        setStats({
          departments: deptCount ?? 0,
          users: userCount ?? 0,
          activeAccounts: activeCount ?? 0,
        });
      } catch (err) {
        console.error('Failed to load dashboard metrics:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardStats();
  }, []);

  const cards = [
    { label: 'Total Departments', icon: 'domain', value: stats.departments },
    { label: 'Total Users', icon: 'manage_accounts', value: stats.users },
    { label: 'Active Accounts', icon: 'verified_user', value: stats.activeAccounts },
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
                {loading ? '—' : card.value}
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