export default function AdminDashboardPage() {
  const cards = [
    { label: 'Total Departments', icon: 'domain', bg: 'bg-primary/5 border-primary/20', iconBg: 'bg-primary/10', iconColor: 'text-primary', value: '—' },
    { label: 'Total Users', icon: 'manage_accounts', bg: 'bg-secondary/5 border-secondary/20', iconBg: 'bg-secondary/10', iconColor: 'text-secondary', value: '—' },
    { label: 'Active Accounts', icon: 'verified_user', bg: 'bg-surface-container border-surface-variant', iconBg: 'bg-surface-container-high', iconColor: 'text-on-surface-variant', value: '—' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
        <p className="text-on-surface-variant text-sm mt-1">Manage departments and user accounts for CoE-NNECT.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border ${card.bg} p-5 flex items-center gap-4`}
          >
            <div className={`${card.iconColor} ${card.iconBg} rounded-lg p-3`}>
              <span className="material-symbols-outlined text-2xl">{card.icon}</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-on-surface">{card.value}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="/admin/departments"
          className="rounded-xl border border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low p-5 flex items-center gap-4 transition-all group"
        >
          <span className="material-symbols-outlined text-3xl text-primary group-hover:scale-110 transition-transform">domain</span>
          <div>
            <p className="font-semibold text-on-surface">Manage Departments</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Create and view all departments</p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant ml-auto">arrow_forward</span>
        </a>

        <a
          href="/admin/users"
          className="rounded-xl border border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low p-5 flex items-center gap-4 transition-all group"
        >
          <span className="material-symbols-outlined text-3xl text-secondary group-hover:scale-110 transition-transform">manage_accounts</span>
          <div>
            <p className="font-semibold text-on-surface">Manage Users</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Create department head accounts</p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant ml-auto">arrow_forward</span>
        </a>
      </div>
    </div>
  );
}

