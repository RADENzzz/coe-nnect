export default function DashboardPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Welcome to CoE-NNECT — College of Engineering Scheduling System
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Active Faculty" value="—" />
        <KpiCard title="Active Sections" value="—" />
        <KpiCard title="Rooms in Use" value="—" />
        <KpiCard title="Pending Approvals" value="—" />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-slate-700 mb-4">
          Recent Activity
        </h2>
        <p className="text-sm text-slate-500">No activity yet.</p>
      </div>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-2xl font-bold text-blue-900 mt-2">{value}</p>
    </div>
  );
}