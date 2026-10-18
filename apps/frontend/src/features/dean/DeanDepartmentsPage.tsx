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
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
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

  // ── Pre-aggregate counts by dept ──
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

  const columns: Column<Department>[] = [
    {
      key: 'name',
      header: 'Department',
      cardVariant: 'title',
      cellClassName: 'font-semibold text-slate-900',
      render: (d) => d.deptName,
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

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Departments
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            All departments under the College of Engineering.
          </p>
        </div>
        <Link
          to="/dean/departments/manage"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#5c1219] text-white text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="settings" size={18} />
          Manage Departments
        </Link>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={departments}
        rowKey={(d) => d.deptId}
        rowTitle={(d) => d.deptName}
        isLoading={isLoading}
        hasSourceRows={departments.length > 0}
        emptyMessage="No departments found."
        noMatchMessage="No departments match your filters."
        onRowClick={() => navigate('/dean/departments/manage')}
      />
    </div>
  );
}