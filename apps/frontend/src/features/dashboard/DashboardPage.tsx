export default function DashboardPage() {
  return (
    <div className="p-6 max-w-desktop mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Welcome to CoE-NNECT — College of Engineering Scheduling System
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Active Faculty" value="—" accent="primary" />
        <KpiCard title="Active Sections" value="—" accent="secondary" />
        <KpiCard title="Rooms in Use" value="—" accent="primary" />
        <KpiCard title="Pending Approvals" value="—" accent="warning" />
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-on-surface">
            Recent Activity
          </h2>
        </div>
        <p className="text-sm text-on-surface-variant">No activity yet.</p>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent: 'primary' | 'secondary' | 'warning';
}) {
  const accentColors = {
    primary: 'text-primary',
    secondary: 'text-secondary-dark',
    warning: 'text-status-warning',
  };

  return (
    <div className="card">
      <p className="label">{title}</p>
      <p className={`text-3xl font-bold mt-2 ${accentColors[accent]}`}>
        {value}
      </p>
    </div>
  );
}