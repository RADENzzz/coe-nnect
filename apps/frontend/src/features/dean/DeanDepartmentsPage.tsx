import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchDepartments } from '../../api/departments.api';
import { fetchUsers } from '../../api/users.api';
import { fetchFaculty } from '../../api/faculty.api';
import { fetchSchedules, fetchActiveTerm } from '../../api/schedule.api';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import StatusBadge, { ActiveBadge } from '../../components/ui/StatusBadge';
import Icon from '../../components/ui/Icon';
import type { Department } from '../../api/departments.api';
import { useNavigate } from 'react-router-dom';

export default function DeanDepartmentsPage() {
  const navigate = useNavigate();

  // Dean sees active AND inactive departments by default — the whole
  // point of this list is to reactivate one. DHs never see this page.
  const [showInactive, setShowInactive] = useState(true);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments', { includeInactive: showInactive }],
    queryFn: () => fetchDepartments(showInactive),
  });

  // Lookup tables use the FULL dept list (both active + inactive) so
  // ownership names show correctly for staff assigned to deactivated
  // departments.
  const { data: allDepartments = [] } = useQuery({
    queryKey: ['departments', { includeInactive: true }],
    queryFn: () => fetchDepartments(true),
    staleTime: 5 * 60 * 1000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty', { includeInactive: false }],
    queryFn: () => fetchFaculty(false),
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

  const facultyCountByDept = (() => {
    const m = new Map<string, number>();
    for (const f of faculty) {
      const id = String(f.deptId ?? '');
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  })();

  const scheduleCountByDept = (() => {
    const m = new Map<string, number>();
    for (const s of schedules) {
      const id = String(s.subject?.deptId ?? '');
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  })();

  const getDeptHead = (deptId: string) =>
    users.find(
      (u) =>
        u.role === 'department_head' &&
        String(u.deptId) === String(deptId) &&
        u.isActive,
    );

  const inactiveCount = allDepartments.filter((d) => !d.isActive).length;

  const columns: Column<Department>[] = [
    {
      key: 'name',
      header: 'Department',
      cardVariant: 'title',
      cellClassName: 'font-semibold text-slate-900',
      render: (d) => (
        <span className="inline-flex items-center gap-2">
          <span className={d.isActive ? '' : 'text-slate-500'}>{d.deptName}</span>
          {!d.isActive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
              <Icon name="block" size={9} />
              Inactive
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      cardVariant: 'badge',
      render: (d) => <StatusBadge tone="neutral">{d.deptCode}</StatusBadge>,
    },
    {
      key: 'head',
      header: 'Department Head',
      cardVariant: 'meta',
      render: (d) => {
        const head = getDeptHead(d.deptId);
        return head ? (
          <span className="text-slate-700">{head.username}</span>
        ) : (
          <span className="text-xs text-slate-400 italic">Not assigned</span>
        );
      },
    },
    {
      key: 'description',
      header: 'Description',
      cardVariant: 'meta',
      cellClassName: 'text-slate-500 text-xs max-w-[200px] truncate',
      render: (d) => d.description || '—',
    },
    {
      key: 'faculty',
      header: 'Faculty',
      cardVariant: 'meta',
      cellClassName: 'text-center text-xs font-mono tabular-nums',
      render: (d) => {
        const n = facultyCountByDept.get(String(d.deptId)) ?? 0;
        return <span className="text-slate-700">{n}</span>;
      },
    },
    {
      key: 'schedules',
      header: 'Schedules',
      cardVariant: 'meta',
      cellClassName: 'text-center text-xs font-mono tabular-nums',
      render: (d) => {
        const n = scheduleCountByDept.get(String(d.deptId)) ?? 0;
        return <span className="text-slate-700">{n}</span>;
      },
    },
    {
      key: 'pending',
      header: 'Pending',
      cardVariant: 'meta',
      cellClassName: 'text-center text-xs font-mono tabular-nums',
      render: (d) => {
        const deptId = String(d.deptId);
        const pending = schedules.filter(
          (s) =>
            s.status === 'review' &&
            String(s.subject?.deptId ?? '') === deptId,
        ).length;
        if (pending === 0) {
          return <span className="text-slate-300">—</span>;
        }
        return (
          <span className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
            {pending}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (d) => <ActiveBadge isActive={d.isActive} />,
    },
  ];

  const emptyMessage = (() => {
    if (allDepartments.length === 0) return 'No departments found.';
    if (!showInactive && inactiveCount > 0) {
      return `No active departments. ${inactiveCount} deactivated department${
        inactiveCount === 1 ? ' is' : 's are'
      } hidden — turn on "Show deactivated" to reactivate.`;
    }
    return 'No departments found.';
  })();

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5 flex items-start justify-between gap-3 flex-wrap" data-tour="dept-header">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Departments
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            All departments under the College of Engineering.
            {inactiveCount > 0 && (
              <>
                {' '}
                <span className="text-rose-700 font-medium">
                  {inactiveCount} deactivated
                </span>
                .
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            aria-pressed={showInactive}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition ${
              showInactive
                ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
            title={
              showInactive
                ? 'Hide deactivated departments'
                : 'Show deactivated departments so you can reactivate them'
            }
          >
            <Icon
              name={showInactive ? 'visibility_off' : 'visibility'}
              size={14}
            />
            {showInactive ? 'Hide' : 'Show'} deactivated
            {inactiveCount > 0 && (
              <span
                className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                  showInactive
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {inactiveCount}
              </span>
            )}
          </button>
          <Link
            to="/dean/departments/manage"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#5c1219] text-white text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="settings" size={18} />
            Manage Departments
          </Link>
        </div>
      </div>

      <div data-tour="dept-table">
        <ResponsiveTable
          columns={columns}
          rows={departments}
          rowKey={(d) => d.deptId}
          rowTitle={(d) => d.deptName}
          isLoading={isLoading}
          hasSourceRows={departments.length > 0}
          emptyMessage={emptyMessage}
          noMatchMessage="No departments match your filters."
          onRowClick={() => navigate('/dean/departments/manage')}
        />
      </div>
    </div>
  );
}