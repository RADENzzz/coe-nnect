import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../api/departments.api';
import { fetchSchedules, fetchActiveTerm } from '../../api/schedule.api';
import { fetchUsers } from '../../api/users.api';
import Icon from '../../components/ui/Icon';

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
      <div className={`w-9 h-9 border flex items-center justify-center ${colors[color]}`}>
        <Icon name={icon} filled size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function DeanDashboardPage() {
  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
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

  const activeDepts = departments.filter((d) => d.isActive);
  const reviewSchedules = schedules.filter((s) => s.status === 'review');
  const finalizedSchedules = schedules.filter((s) => s.status === 'finalized' || s.status === 'published');
  const deptHeads = users.filter((u) => u.role === 'department_head' && u.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Dean's Overview</h1>
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
          icon="manage_accounts"
          label="Dept. Heads"
          value={deptHeads.length}
          sub="Active accounts"
          color="blue"
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Departments list */}
        <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">Departments</h2>
            <span className="text-xs text-slate-400">{activeDepts.length} active</span>
          </div>
          {deptLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#5c1219] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeDepts.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No departments found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeDepts.map((dept) => {
                const head = users.find(
                  (u) => u.role === 'department_head' && String(u.deptId) === String(dept.deptId) && u.isActive,
                );
                const deptSchedules = schedules.filter((s) => {
                  // A rough match — schedules don't directly link to dept, so we use head's deptId
                  return true;
                });
                return (
                  <div key={dept.deptId} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{dept.deptName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {dept.deptCode}
                        {head ? ` · Head: ${head.username}` : ' · No head assigned'}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending Approvals */}
        <div className="bg-white border border-slate-200 shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">Pending Approvals</h2>
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
              <p className="text-sm font-semibold text-slate-700">All caught up</p>
              <p className="text-xs text-slate-400 mt-1">No schedules pending review.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-80">
              {reviewSchedules.slice(0, 10).map((s) => (
                <div key={s.scheduleId} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {s.subject?.subjectCode ?? 'Unknown Subject'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {s.faculty ? `${s.faculty.firstName} ${s.faculty.lastName}` : 'No faculty'} ·{' '}
                    {s.timeSlot?.dayOfWeek ?? s.dayOfWeek ?? '—'}{' '}
                    {s.timeSlot?.startTime ?? s.startTime ?? ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
