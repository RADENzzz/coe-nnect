import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../api/departments.api';
import { fetchUsers } from '../../api/users.api';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import StatusBadge, { ActiveBadge } from '../../components/ui/StatusBadge';
import type { Department } from '../../api/departments.api';

export default function DeanDepartmentsPage() {
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

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
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (d) => <ActiveBadge isActive={d.isActive} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Departments
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          All departments under the College of Engineering.
        </p>
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
      />
    </div>
  );
}